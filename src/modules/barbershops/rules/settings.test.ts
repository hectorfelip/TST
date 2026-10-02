import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { expectError, NOW, owner, rafael } from "@/test/fixtures";
import { DEFAULT_SETTINGS, pendingExpiry, updateSettings, validateSettings } from "./settings";

describe("settings are validated", () => {
  it("days for 'sumido', pending deadline and time zone", () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, awayAfterDays: 45 }).ok).toBe(true);
    expectError(validateSettings({ ...DEFAULT_SETTINGS, awayAfterDays: 3 }), "INVALID_INPUT");
    expectError(validateSettings({ ...DEFAULT_SETTINGS, awayAfterDays: 400 }), "INVALID_INPUT");
    expectError(validateSettings({ ...DEFAULT_SETTINGS, timeZone: "Mars/Olympus" }), "INVALID_INPUT");
  });

  it("R-SET-01: the automatic cancellation of pending comandas is an OPTION, on by default with 5 days", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ autoCancelPending: true, pendingExpiryDays: 5 });
    expect(pendingExpiry(DEFAULT_SETTINGS)).toBe(5);
  });

  it("the deadline is custom: 1 to 30 days", () => {
    for (const days of [1, 2, 7, 15, 30]) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, pendingExpiryDays: days }).ok).toBe(true);
      expect(pendingExpiry({ autoCancelPending: true, pendingExpiryDays: days })).toBe(days);
    }
    for (const days of [0, -1, 31, 2.5, Number.NaN]) {
      expectError(validateSettings({ ...DEFAULT_SETTINGS, pendingExpiryDays: days }), "INVALID_INPUT");
    }
  });

  it("with the option off there is no deadline (null), but the saved number stays valid", () => {
    const off = { ...DEFAULT_SETTINGS, autoCancelPending: false, pendingExpiryDays: 10 };
    expect(validateSettings(off).ok).toBe(true);
    expect(pendingExpiry(off)).toBeNull();
    expectError(validateSettings({ ...off, pendingExpiryDays: 99 }), "INVALID_INPUT"); // never starts with a bad value when turned on later
  });
});

describe("updateSettings (R-SET-02)", () => {
  it("only the owner; audited with the old and new values", () => {
    const next = { ...DEFAULT_SETTINGS, autoCancelPending: false, pendingExpiryDays: 10 };
    expectError(updateSettings(rafael, DEFAULT_SETTINGS, next, NOW), "FORBIDDEN");
    const { settings, audit } = unwrap(updateSettings(owner, DEFAULT_SETTINGS, next, NOW));
    expect(settings).toEqual(next);
    expect(audit).toMatchObject({
      action: "settings.changed",
      userId: "carlos",
      details: { autoCancelPending: "true → false", pendingExpiryDays: "5 → 10" },
    });
  });

  it("refuses invalid values and 'no change'", () => {
    expectError(updateSettings(owner, DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, pendingExpiryDays: 45 }, NOW), "INVALID_INPUT");
    expectError(updateSettings(owner, DEFAULT_SETTINGS, DEFAULT_SETTINGS, NOW), "INVALID_INPUT");
  });
});
