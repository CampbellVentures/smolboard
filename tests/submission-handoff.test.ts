import { describe, expect, test } from "bun:test";
import { mappingSourceValues, materializeSubmissionData } from "../lib/submission-handoff";

const submission = {
  id: "sub_1",
  title: "Lossless handoff",
  abstract: "The complete abstract.",
  speakerUserId: "usr_primary",
  answersJson: { format: "Hands-on workshop", track: "Platform", legacy: "kept" },
  participantSnapshotJson: [
    { userId: "usr_primary", name: "Primary", email: "primary@example.test", roleLabel: "Primary presenter" },
    { userId: "usr_co", name: "Co", email: "co@example.test", roleLabel: "Co-presenter" },
  ],
};

describe("submission to agenda handoff", () => {
  test("legacy forms remain visibly unresolved instead of guessing", () => {
    const result = materializeSubmissionData({ submission, configRaw: undefined, validTrackIds: new Set() });
    expect(result.data).toBeUndefined();
    expect(result.unresolved).toEqual([expect.objectContaining({ dimension: "configuration" })]);
    expect(submission.answersJson.legacy).toBe("kept");
  });

  test("unmapped exact source values stay visible", () => {
    const result = materializeSubmissionData({
      submission,
      configRaw: { formatFieldKey: "format", formatValues: {}, trackFieldKey: "track", trackValues: {} },
      validTrackIds: new Set(["track_platform"]),
    });
    expect(result.data).toBeUndefined();
    expect(result.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: "format", value: "Hands-on workshop" }),
      expect.objectContaining({ dimension: "track", value: "Platform" }),
    ]));
  });

  test("explicit mappings copy every canonical field and participant", () => {
    const result = materializeSubmissionData({
      submission,
      configRaw: {
        formatFieldKey: "format",
        formatValues: { "Hands-on workshop": "workshop" },
        trackFieldKey: "track",
        trackValues: { Platform: "track_platform" },
      },
      validTrackIds: new Set(["track_platform"]),
    });
    expect(result.unresolved).toEqual([]);
    expect(result.data).toEqual({
      submissionId: "sub_1",
      title: "Lossless handoff",
      description: "The complete abstract.",
      kind: "workshop",
      trackId: "track_platform",
      speakerUserIdsJson: ["usr_primary", "usr_co"],
    });
  });

  test("mapping inventory retains exact legacy values", () => {
    expect(mappingSourceValues([
      { answersJson: { format: "Talk" } },
      { answersJson: { format: ["Workshop", "Talk"] } },
    ], "format")).toEqual(["Talk", "Workshop"]);
  });
});
