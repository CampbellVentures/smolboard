import { expect, test } from "bun:test";
import { packLanes, type LaneItem } from "../lib/agenda";

// packLanes drives the week view: one column per day holding every room, so
// concurrent talks need horizontal lanes instead of stacking.

function place(items: LaneItem[]) {
  const map = packLanes(items);
  return Object.fromEntries([...map].map(([id, p]) => [id, `${p.lane}/${p.lanes}`]));
}

test("a lone session takes the full width", () => {
  expect(place([{ id: "a", start: 600, end: 660 }])).toEqual({ a: "0/1" });
});

test("two overlapping sessions split the column", () => {
  expect(
    place([
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 630, end: 690 },
    ]),
  ).toEqual({ a: "0/2", b: "1/2" });
});

test("back-to-back sessions reuse one lane", () => {
  expect(
    place([
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 660, end: 720 },
    ]),
  ).toEqual({ a: "0/1", b: "0/1" });
});

test("clusters are independent — a busy morning doesn't squeeze the afternoon", () => {
  const result = place([
    { id: "m1", start: 600, end: 660 },
    { id: "m2", start: 600, end: 660 },
    { id: "m3", start: 600, end: 660 },
    { id: "afternoon", start: 900, end: 960 },
  ]);
  expect(result.m1).toBe("0/3");
  expect(result.m2).toBe("1/3");
  expect(result.m3).toBe("2/3");
  // The keynote is alone in its cluster, so it spans the whole column.
  expect(result.afternoon).toBe("0/1");
});

test("a long session holds its lane while short ones cycle beside it", () => {
  const result = place([
    { id: "long", start: 600, end: 780 },
    { id: "s1", start: 600, end: 660 },
    { id: "s2", start: 660, end: 720 },
  ]);
  expect(result.long).toBe("0/2");
  expect(result.s1).toBe("1/2");
  // s2 starts when s1 ends, so it reuses lane 1 rather than opening a third.
  expect(result.s2).toBe("1/2");
});

test("input order does not change the result", () => {
  const items: LaneItem[] = [
    { id: "b", start: 630, end: 690 },
    { id: "a", start: 600, end: 660 },
  ];
  expect(place(items)).toEqual(place(items.slice().reverse()));
});

test("every input id gets a placement", () => {
  const items: LaneItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: `s${i}`,
    start: 600 + (i % 5) * 30,
    end: 660 + (i % 5) * 30,
  }));
  const map = packLanes(items);
  expect(map.size).toBe(20);
  for (const item of items) expect(map.has(item.id)).toBe(true);
});

test("empty input yields no placements", () => {
  expect(packLanes([]).size).toBe(0);
});
