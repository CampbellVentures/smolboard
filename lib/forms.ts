// Form engine — pure logic shared by the builder (preview), the public CFP
// renderer, and the submitCfp server function. No framework imports so every
// branch is unit-testable (tests/forms.test.ts).

export type FieldType =
  | "short_text"
  | "long_text"
  | "select"
  | "multiselect"
  | "checkbox"
  | "email"
  | "url"
  | "section";

export type ShowIfOp = "equals" | "not_equals" | "contains" | "is_answered";

export interface ShowIfRule {
  // Key of the controlling field.
  field: string;
  op: ShowIfOp;
  // Unused for is_answered.
  value?: string;
}

export interface FormField {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  // select / multiselect
  options?: string[];
  // Field is visible only when every rule matches (AND).
  showIf?: ShowIfRule[];
}

export type Answers = Record<string, string | string[] | boolean | undefined>;

export interface RoutingRule {
  field: string;
  op: ShowIfOp;
  value?: string;
  category: string;
}

export interface RoutingConfig {
  rules: RoutingRule[];
  defaultCategory?: string;
}

// The public CFP form always captures these regardless of custom fields; they
// feed User/SpeakerProfile/Submission columns rather than answersJson.
export const BUILTIN_KEYS = ["speaker_name", "speaker_email", "title", "abstract"] as const;

export function isBuiltinKey(key: string): boolean {
  return (BUILTIN_KEYS as readonly string[]).includes(key);
}

function answerMatches(answer: Answers[string], op: ShowIfOp, value?: string): boolean {
  const answered =
    answer !== undefined &&
    answer !== "" &&
    answer !== false &&
    !(Array.isArray(answer) && answer.length === 0);
  if (op === "is_answered") return answered;
  if (!answered) return false;
  const target = value ?? "";
  if (Array.isArray(answer)) {
    if (op === "contains") return answer.includes(target);
    if (op === "equals") return answer.length === 1 && answer[0] === target;
    return !answer.includes(target);
  }
  const text = typeof answer === "boolean" ? String(answer) : answer;
  if (op === "contains") return text.toLowerCase().includes(target.toLowerCase());
  if (op === "equals") return text === target;
  return text !== target;
}

// A field with showIf rules is visible only when ALL rules pass. Rules that
// reference a currently-hidden field evaluate against that field's answer as
// normal — the renderer clears answers of hidden fields on change, so chains
// (A shows B, B shows C) collapse correctly when A flips.
export function evaluateShowIf(field: FormField, answers: Answers): boolean {
  if (!field.showIf || field.showIf.length === 0) return true;
  return field.showIf.every((rule) => answerMatches(answers[rule.field], rule.op, rule.value));
}

export function visibleFields(fields: FormField[], answers: Answers): FormField[] {
  return fields.filter((f) => evaluateShowIf(f, answers));
}

// Strip answers that belong to hidden fields (so conditional chains don't
// submit stale values) and unknown keys (so a crafted POST can't stuff data).
export function pruneAnswers(fields: FormField[], answers: Answers): Answers {
  const out: Answers = {};
  for (const f of visibleFields(fields, answers)) {
    if (f.type === "section") continue;
    if (answers[f.key] !== undefined) out[f.key] = answers[f.key];
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

export interface ValidationError {
  field: string;
  message: string;
}

// Validates only VISIBLE fields — a required field hidden by its showIf rules
// is not required. Returns [] when valid.
export function validateAnswers(fields: FormField[], answers: Answers): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const f of visibleFields(fields, answers)) {
    if (f.type === "section") continue;
    const a = answers[f.key];
    const missing =
      a === undefined ||
      a === "" ||
      a === false ||
      (Array.isArray(a) && a.length === 0);
    if (missing) {
      if (f.required) errors.push({ field: f.key, message: `${f.label} is required.` });
      continue;
    }
    if (f.type === "email" && typeof a === "string" && !EMAIL_RE.test(a)) {
      errors.push({ field: f.key, message: `${f.label} must be a valid email.` });
    }
    if (f.type === "url" && typeof a === "string" && !URL_RE.test(a)) {
      errors.push({ field: f.key, message: `${f.label} must be a valid URL (https://…).` });
    }
    if ((f.type === "select" || f.type === "multiselect") && f.options) {
      const chosen = Array.isArray(a) ? a : [a];
      for (const c of chosen) {
        if (typeof c !== "string" || !f.options.includes(c)) {
          errors.push({ field: f.key, message: `${f.label}: "${String(c)}" is not an option.` });
        }
      }
    }
    if (f.type === "checkbox" && typeof a !== "boolean") {
      errors.push({ field: f.key, message: `${f.label} must be a checkbox value.` });
    }
  }
  return errors;
}

// First matching rule wins; falls back to defaultCategory (or undefined).
export function routeSubmission(routing: RoutingConfig | undefined, answers: Answers): string | undefined {
  if (!routing) return undefined;
  for (const rule of routing.rules ?? []) {
    if (answerMatches(answers[rule.field], rule.op, rule.value)) return rule.category;
  }
  return routing.defaultCategory || undefined;
}

// Builder helper: stable unique key from a label ("Talk format?" → "talk_format").
export function keyFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field";
  let key = base;
  let n = 2;
  while (taken.has(key) || isBuiltinKey(key)) key = `${base}_${n++}`;
  return key;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Parse entity json columns defensively — organizers can hand-edit via API.
export function parseFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is FormField =>
      !!f && typeof f === "object" && typeof (f as FormField).key === "string" && typeof (f as FormField).type === "string",
  );
}

export function parseRouting(raw: unknown): RoutingConfig | undefined {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as RoutingConfig).rules)) return undefined;
  return raw as RoutingConfig;
}
