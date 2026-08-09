import { expect, test } from "bun:test";
import { parseSpeakerUserIds } from "../lib/portal";

test("speaker schedule membership accepts current and legacy JSON values", () => {
  expect(parseSpeakerUserIds(["speaker-1", 2, "speaker-2"])).toEqual([
    "speaker-1",
    "speaker-2",
  ]);
  expect(parseSpeakerUserIds('["speaker-3"]')).toEqual(["speaker-3"]);
  expect(parseSpeakerUserIds("not-json")).toEqual([]);
});
