import { describe, expect, it } from "vitest";
import { expectError, owner, rafael } from "@/test/fixtures";
import { DEFAULT_BOOKING_SETTINGS, daysFromMask, isOpenOn, maskFromDays, suggestSlug, updateBookingSettings, validateBookingSettings, validateSlug } from "./settings";

const NOW = new Date("2026-10-14T12:00:00Z");
const on = { ...DEFAULT_BOOKING_SETTINGS, enabled: true, slug: "barbearia-exemplo" };

describe("slug", () => {
  it("accepts a clean address (and lower-cases it)", () => {
    expect(validateSlug(" Barbearia-Exemplo ")).toEqual({ ok: true, value: "barbearia-exemplo" });
  });
  it.each(["ab", "a".repeat(41), "com espaço", "acentuação", "-começa", "termina-", "dois--hifens", "UPPER_case", "a/b"])("refuses %j", (s) => {
    expect(validateSlug(s).ok).toBe(false);
  });
  it("suggests an address from the name", () => {
    expect(suggestSlug("Barbearia do Zé!")).toBe("barbearia-do-ze");
    expect(suggestSlug("  Cortes & Cia  ")).toBe("cortes-cia");
    expect(validateSlug(suggestSlug("ZZ")).ok).toBe(true);
    expect(validateSlug(suggestSlug("Á")).ok).toBe(true);
  });
});

describe("open days", () => {
  it("bits per weekday", () => {
    expect(maskFromDays([1, 2, 3, 4, 5, 6])).toBe(126);
    expect(daysFromMask(126)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isOpenOn(126, 0)).toBe(false);
    expect(isOpenOn(126, 6)).toBe(true);
    expect(maskFromDays([0, 9, -1])).toBe(1);
  });
});

describe("validateBookingSettings", () => {
  it("the default is valid; a link that is ON needs an address", () => {
    expect(validateBookingSettings(DEFAULT_BOOKING_SETTINGS).ok).toBe(true);
    expectError(validateBookingSettings({ ...DEFAULT_BOOKING_SETTINGS, enabled: true }), "INVALID_INPUT");
    expect(validateBookingSettings(on).ok).toBe(true);
  });
  it.each([
    ["no open day", { openDays: 0 }],
    ["opens after closing", { openMinute: 20 * 60 }],
    ["opens when closing", { openMinute: 19 * 60 }],
    ["bad slot", { slotMinutes: 25 }],
    ["notice too long", { minNoticeMinutes: 2000 }],
    ["hours shorter than a slot", { openMinute: 9 * 60, closeMinute: 9 * 60 + 20, slotMinutes: 30 }],
    ["negative open", { openMinute: -5 }],
    ["fractions", { slotMinutes: 30.5 }],
  ])("refuses %s", (_, change) => {
    expectError(validateBookingSettings({ ...on, ...change }), "INVALID_INPUT");
  });
});

describe("updateBookingSettings", () => {
  it("only the owner; audited with old → new; no change is refused", () => {
    const next = { ...on, requiresApproval: true, openMinute: 8 * 60 };
    const done = updateBookingSettings(owner, on, next, NOW);
    expect(done.ok && done.value.audit).toMatchObject({ action: "booking.settings_changed", details: { requiresApproval: "false → true", openMinute: "09:00 → 08:00" } });
    expectError(updateBookingSettings(rafael, on, next, NOW), "FORBIDDEN");
    expectError(updateBookingSettings(owner, on, on, NOW), "INVALID_INPUT");
  });
});
