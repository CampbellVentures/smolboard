import { expect, test } from "bun:test";
import { findDuplicates, parseContactCsv, splitCsvLine } from "../lib/contacts";
import { applyMergeTags } from "../lib/contacts-email";

test("quoted fields and escaped quotes survive", () => {
  expect(splitCsvLine('a,"b,c","she said ""hi""",d')).toEqual(["a", "b,c", 'she said "hi"', "d"]);
});

test("header order doesn't matter and tags split", () => {
  const { rows, errors } = parseContactCsv(
    "Email,Name,Tags,Company\nada@example.dev,Ada Lovelace,keynote;infra,Analytical Engines",
  );
  expect(errors).toEqual([]);
  expect(rows[0]).toEqual({
    name: "Ada Lovelace",
    email: "ada@example.dev",
    company: "Analytical Engines",
    jobTitle: "",
    tags: ["keynote", "infra"],
    stage: "prospect",
  });
});

test("bad rows are reported, not silently dropped", () => {
  const { rows, errors } = parseContactCsv(
    "name,email\nNo Email,\nBad Address,not-an-email\nDupe,d@x.dev\nDupe Again,d@x.dev",
  );
  expect(rows).toHaveLength(1);
  expect(errors).toHaveLength(3);
});

test("a file without the required columns is rejected", () => {
  expect(parseContactCsv("foo,bar\n1,2").errors[0]).toContain("Name and Email");
});

test("duplicates group by name across different emails", () => {
  const groups = findDuplicates([
    { id: "1", name: "Ada Lovelace", email: "ada@a.dev" },
    { id: "2", name: "ada lovelace", email: "ada@b.dev" },
    { id: "3", name: "Alan Turing", email: "alan@a.dev" },
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0].members.map((m) => m.id)).toEqual(["1", "2"]);
});

test("merge tags fill in and unknown tags vanish", () => {
  expect(applyMergeTags("Hi {{first_name}} at {{company}} — {{nope}}", {
    first_name: "Ada",
    company: "Analytical Engines",
  })).toBe("Hi Ada at Analytical Engines — ");
});
