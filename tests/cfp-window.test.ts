import { describe, expect, test } from "bun:test";
import {
  cfpWindowState,
  formatCfpInstant,
  utcToZonedInput,
  zonedInputToUtc,
} from "../lib/cfp-window";

const window = {
  eventStatus: "open",
  formStatus: "open",
  opensAt: "2027-05-01T14:00:00.000Z",
  closesAt: "2027-06-01T05:00:00.000Z",
};

describe("CFP window boundaries", () => {
  test("opening is inclusive and closing is exclusive", () => {
    expect(cfpWindowState(window, "2027-05-01T13:59:59.999Z")).toBe("upcoming");
    expect(cfpWindowState(window, window.opensAt)).toBe("open");
    expect(cfpWindowState(window, "2027-06-01T04:59:59.999Z")).toBe("open");
    expect(cfpWindowState(window, window.closesAt)).toBe("closed");
  });

  test("manual event and form closure always wins", () => {
    expect(cfpWindowState({ ...window, eventStatus: "closed" }, window.opensAt)).toBe("closed");
    expect(cfpWindowState({ ...window, formStatus: "closed" }, window.opensAt)).toBe("closed");
  });

  test("malformed or inverted legacy windows fail closed", () => {
    expect(cfpWindowState({ ...window, closesAt: "not-a-date" }, window.opensAt)).toBe("closed");
    expect(cfpWindowState({ ...window, closesAt: window.opensAt }, window.opensAt)).toBe("closed");
  });

  test("organizer local inputs round-trip through the event timezone", () => {
    expect(zonedInputToUtc("2027-05-31T23:59", "America/Chicago"))
      .toBe("2027-06-01T04:59:00.000Z");
    expect(utcToZonedInput("2027-06-01T04:59:00.000Z", "America/Chicago"))
      .toBe("2027-05-31T23:59");
    expect(formatCfpInstant("2027-06-01T04:59:00.000Z", "America/Chicago"))
      .toContain("May 31, 2027");
  });
});
