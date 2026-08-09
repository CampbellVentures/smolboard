import { describe, expect, test } from "bun:test";
import {
  type FormField,
  type RoutingConfig,
  evaluateShowIf,
  keyFromLabel,
  mergeLegacyAnswers,
  parseFields,
  parseRouting,
  pruneAnswers,
  routeSubmission,
  slugify,
  validateAnswers,
  visibleFields,
} from "../lib/forms";

const FIELDS: FormField[] = [
  { key: "format", type: "select", label: "Format", required: true, options: ["Talk", "Workshop"] },
  {
    key: "workshop_length",
    type: "select",
    label: "Workshop length",
    required: true,
    options: ["90m", "3h"],
    showIf: [{ field: "format", op: "equals", value: "Workshop" }],
  },
  {
    key: "setup_notes",
    type: "long_text",
    label: "Setup notes",
    showIf: [
      { field: "format", op: "equals", value: "Workshop" },
      { field: "workshop_length", op: "equals", value: "3h" },
    ],
  },
  { key: "topics", type: "multiselect", label: "Topics", options: ["Agents", "Evals", "Infra"] },
  { key: "video_url", type: "url", label: "Video" },
  { key: "contact", type: "email", label: "Contact email", required: true },
  { key: "travel", type: "checkbox", label: "Needs travel support" },
  { key: "sec", type: "section", label: "About you" },
];

describe("evaluateShowIf", () => {
  test("no rules → always visible", () => {
    expect(evaluateShowIf(FIELDS[0], {})).toBe(true);
  });
  test("equals rule hides until matched", () => {
    expect(evaluateShowIf(FIELDS[1], {})).toBe(false);
    expect(evaluateShowIf(FIELDS[1], { format: "Talk" })).toBe(false);
    expect(evaluateShowIf(FIELDS[1], { format: "Workshop" })).toBe(true);
  });
  test("multiple rules AND together", () => {
    expect(evaluateShowIf(FIELDS[2], { format: "Workshop" })).toBe(false);
    expect(evaluateShowIf(FIELDS[2], { format: "Workshop", workshop_length: "90m" })).toBe(false);
    expect(evaluateShowIf(FIELDS[2], { format: "Workshop", workshop_length: "3h" })).toBe(true);
  });
  test("not_equals is false when unanswered", () => {
    const f: FormField = {
      key: "x",
      type: "short_text",
      label: "X",
      showIf: [{ field: "format", op: "not_equals", value: "Talk" }],
    };
    expect(evaluateShowIf(f, {})).toBe(false);
    expect(evaluateShowIf(f, { format: "Workshop" })).toBe(true);
    expect(evaluateShowIf(f, { format: "Talk" })).toBe(false);
  });
  test("contains matches arrays and substrings", () => {
    const arr: FormField = {
      key: "x",
      type: "short_text",
      label: "X",
      showIf: [{ field: "topics", op: "contains", value: "Evals" }],
    };
    expect(evaluateShowIf(arr, { topics: ["Agents"] })).toBe(false);
    expect(evaluateShowIf(arr, { topics: ["Agents", "Evals"] })).toBe(true);
    const sub: FormField = {
      key: "y",
      type: "short_text",
      label: "Y",
      showIf: [{ field: "contact", op: "contains", value: "@ai" }],
    };
    expect(evaluateShowIf(sub, { contact: "sam@AI.engineer" })).toBe(true);
  });
  test("is_answered", () => {
    const f: FormField = {
      key: "x",
      type: "short_text",
      label: "X",
      showIf: [{ field: "video_url", op: "is_answered" }],
    };
    expect(evaluateShowIf(f, {})).toBe(false);
    expect(evaluateShowIf(f, { video_url: "" })).toBe(false);
    expect(evaluateShowIf(f, { video_url: "https://x.com" })).toBe(true);
    expect(evaluateShowIf(f, { topics: [] })).toBe(false);
  });
});

describe("pruneAnswers", () => {
  test("drops hidden-field answers (stale conditional chain)", () => {
    const pruned = pruneAnswers(FIELDS, {
      format: "Talk",
      workshop_length: "3h", // stale — hidden after switching Workshop → Talk
      contact: "a@b.co",
    });
    expect(pruned).toEqual({ format: "Talk", contact: "a@b.co" });
  });
  test("drops unknown keys", () => {
    const pruned = pruneAnswers(FIELDS, { format: "Talk", evil: "x", contact: "a@b.co" });
    expect(pruned.evil).toBeUndefined();
  });
  test("preserves only previously stored unknown legacy answers", () => {
    const pruned = pruneAnswers(FIELDS, { format: "Talk", crafted: "drop", contact: "a@b.co" });
    expect(mergeLegacyAnswers(FIELDS, { legacy_question: { original: true } }, pruned)).toEqual({
      legacy_question: { original: true },
      format: "Talk",
      contact: "a@b.co",
    });
    expect(mergeLegacyAnswers(FIELDS, {}, pruned).crafted).toBeUndefined();
  });
});

describe("validateAnswers", () => {
  test("hidden required fields are not required", () => {
    const errs = validateAnswers(FIELDS, { format: "Talk", contact: "a@b.co" });
    expect(errs).toEqual([]);
  });
  test("visible required fields are enforced", () => {
    const errs = validateAnswers(FIELDS, { format: "Workshop", contact: "a@b.co" });
    expect(errs.map((e) => e.field)).toEqual(["workshop_length"]);
  });
  test("email + url formats", () => {
    const errs = validateAnswers(FIELDS, {
      format: "Talk",
      contact: "not-an-email",
      video_url: "ftp://nope",
    });
    expect(errs.map((e) => e.field).sort()).toEqual(["contact", "video_url"]);
  });
  test("select options are enforced (crafted POST)", () => {
    const errs = validateAnswers(FIELDS, {
      format: "DROP TABLE",
      topics: ["Agents", "Nonsense"],
      contact: "a@b.co",
    });
    expect(errs.map((e) => e.field).sort()).toEqual(["format", "topics"]);
  });
  test("checkbox type is enforced", () => {
    const errs = validateAnswers(FIELDS, { format: "Talk", contact: "a@b.co", travel: "yes" as unknown as boolean });
    expect(errs.map((e) => e.field)).toEqual(["travel"]);
  });
  test("unchecked required checkbox counts as missing", () => {
    const f: FormField[] = [{ key: "coc", type: "checkbox", label: "Agree to CoC", required: true }];
    expect(validateAnswers(f, { coc: false }).map((e) => e.field)).toEqual(["coc"]);
    expect(validateAnswers(f, { coc: true })).toEqual([]);
  });
});

describe("routeSubmission", () => {
  const routing: RoutingConfig = {
    rules: [
      { field: "format", op: "equals", value: "Workshop", category: "workshops" },
      { field: "topics", op: "contains", value: "Evals", category: "evals-track" },
    ],
    defaultCategory: "general",
  };
  test("first matching rule wins", () => {
    expect(routeSubmission(routing, { format: "Workshop", topics: ["Evals"] })).toBe("workshops");
  });
  test("later rules match when earlier miss", () => {
    expect(routeSubmission(routing, { format: "Talk", topics: ["Evals"] })).toBe("evals-track");
  });
  test("falls back to default", () => {
    expect(routeSubmission(routing, { format: "Talk", topics: ["Infra"] })).toBe("general");
  });
  test("no routing config → undefined", () => {
    expect(routeSubmission(undefined, { format: "Talk" })).toBeUndefined();
  });
  test("no default → undefined", () => {
    expect(routeSubmission({ rules: [] }, {})).toBeUndefined();
  });
});

describe("builder helpers", () => {
  test("keyFromLabel slugs and dedupes", () => {
    const taken = new Set<string>();
    const k1 = keyFromLabel("Talk format?", taken);
    expect(k1).toBe("talk_format");
    taken.add(k1);
    expect(keyFromLabel("Talk format?", taken)).toBe("talk_format_2");
  });
  test("keyFromLabel avoids builtin keys", () => {
    expect(keyFromLabel("Title", new Set())).toBe("title_2");
  });
  test("slugify", () => {
    expect(slugify("AI Engineer — World's Fair 2026!")).toBe("ai-engineer-world-s-fair-2026");
  });
  test("parseFields filters junk", () => {
    expect(parseFields(null)).toEqual([]);
    expect(parseFields([{ key: "a", type: "short_text", label: "A" }, { nope: 1 }, "x"])).toHaveLength(1);
  });
  test("parseRouting rejects malformed", () => {
    expect(parseRouting({ rules: "no" })).toBeUndefined();
    expect(parseRouting({ rules: [] })?.rules).toEqual([]);
  });
});

describe("visibleFields ordering", () => {
  test("keeps author order and includes sections", () => {
    const vis = visibleFields(FIELDS, { format: "Workshop", workshop_length: "3h" });
    expect(vis.map((f) => f.key)).toEqual([
      "format",
      "workshop_length",
      "setup_notes",
      "topics",
      "video_url",
      "contact",
      "travel",
      "sec",
    ]);
  });
});
