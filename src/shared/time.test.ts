import { describe, expect, it } from "vitest";
import { dayRange, isValidTimeZone, offsetMinutes, startOfDay } from "./time";

const SP = "America/Sao_Paulo";

describe("time zone helpers", () => {
  it("São Paulo is UTC-3", () => {
    expect(offsetMinutes(new Date("2026-10-02T15:00:00Z"), SP)).toBe(-180);
  });

  it("start of the local day (00:00 São Paulo = 03:00 UTC)", () => {
    expect(startOfDay(new Date("2026-10-02T15:00:00Z"), SP).toISOString()).toBe("2026-10-02T03:00:00.000Z");
    expect(startOfDay(new Date("2026-10-02T15:00:00Z"), SP, 1).toISOString()).toBe("2026-10-03T03:00:00.000Z");
  });

  it("23:30 in São Paulo is still the same local day, even though UTC is already tomorrow", () => {
    const lateNight = new Date("2026-10-03T02:30:00Z"); // 23:30 on 02/10 in São Paulo
    expect(startOfDay(lateNight, SP).toISOString()).toBe("2026-10-02T03:00:00.000Z");
    expect(startOfDay(lateNight, "UTC").toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("dayRange gives [from, to) of exactly one day", () => {
    const { from, to } = dayRange(new Date("2026-10-02T15:00:00Z"), SP);
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("validates time zone names", () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
