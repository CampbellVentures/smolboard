import { expect, test } from "bun:test";
import { keyFor } from "../components/scorecard-editor";
import { normalizeCriteria } from "../lib/reviews";

test("keys are slugified and de-duplicated", () => {
  const taken = new Set<string>();
  const a = keyFor("Relevance to the audience", taken);
  taken.add(a);
  expect(a).toBe("relevance_to_the_audience");
  expect(keyFor("Relevance to the audience", taken)).toBe("relevance_to_the_audience_2");
});

test("a mixed scorecard survives normalization", () => {
  const criteria = normalizeCriteria([
    { key: "relevance", label: "Relevance", type: "numeric", max: 10, weight: 3 },
    { key: "fit", label: "Track fit", type: "select", options: ["Strong", "Weak"] },
    { key: "notes", label: "Notes", type: "text" },
  ]);
  expect(criteria.map((c) => c.type)).toEqual(["numeric", "select", "text"]);
  expect(criteria[0].max).toBe(10);
  expect(criteria[0].weight).toBe(3);
  expect(criteria[1].options).toEqual(["Strong", "Weak"]);
});
