import { describe, expect, it } from "vitest";
import { addDaysYmd, atLocalTime, monthLabel, shiftMonth, ymdTitle, formatMinutes, isValidYmd, localYmd, minutesOfDay, monthWeeks, weekdayOfYmd, zonedTime, clockTime, dayRange, dayTitle, isValidTimeZone, monthRange, offsetMinutes, relativeDay, startOfDay } from "./time";

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

describe("labels in the barbershop's time zone", () => {
  const now = new Date("2026-10-02T15:00:00Z"); // 12:00 on Friday 02/10 in São Paulo

  it("clock time uses the shop's zone, not the server's", () => {
    expect(clockTime(new Date("2026-10-02T14:05:00Z"), SP)).toBe("11:05");
    expect(clockTime(new Date("2026-10-03T02:30:00Z"), SP)).toBe("23:30");
  });

  it("builds the instant of a local time today or tomorrow, and refuses text that is not a time", () => {
    expect(atLocalTime(now, SP, 0, "15:30")?.toISOString()).toBe("2026-10-02T18:30:00.000Z");
    expect(atLocalTime(now, SP, 1, "09:00")?.toISOString()).toBe("2026-10-03T12:00:00.000Z");
    for (const bad of ["", "9:00", "24:00", "12:60", "ab:cd", "12:00:00"]) expect(atLocalTime(now, SP, 0, bad), bad).toBeNull();
  });

  it("relative day names", () => {
    expect(relativeDay(new Date("2026-10-02T13:00:00Z"), now, SP)).toBe("Hoje");
    expect(relativeDay(new Date("2026-10-03T13:00:00Z"), now, SP)).toBe("Amanhã");
    expect(relativeDay(new Date("2026-10-01T13:00:00Z"), now, SP)).toBe("Ontem");
    expect(relativeDay(new Date("2026-09-28T13:00:00Z"), now, SP)).toBe("28/09");
    // 23:30 local on 02/10 is already 03/10 in UTC, and still "Hoje" in São Paulo
    expect(relativeDay(new Date("2026-10-03T02:30:00Z"), now, SP)).toBe("Hoje");
  });

  it("month range: from the first local midnight to the first local midnight of the next month", () => {
    const { from, to, label } = monthRange(now, SP);
    expect(from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(label).toBe("Outubro 2026");
    expect(monthRange(new Date("2026-12-15T12:00:00Z"), SP).to.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("the month of a late-night moment is the LOCAL month", () => {
    // 01/11 01:00 UTC is still 31/10 22:00 in São Paulo
    expect(monthRange(new Date("2026-11-01T01:00:00Z"), SP).label).toBe("Outubro 2026");
  });

  it("day title", () => {
    expect(dayTitle(now, SP)).toBe("Sexta-feira 02/10");
  });
});

describe("calendar dates", () => {
  it("validates real dates only", () => {
    expect(isValidYmd("2026-10-14")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-1", "14/10/2026", "", "2026-00-10"]) expect(isValidYmd(bad), bad).toBe(false);
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2027-02-29")).toBe(false);
  });

  it("date arithmetic crosses months and years", () => {
    expect(addDaysYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => addDaysYmd("nope", 1)).toThrow();
  });

  it("weekday", () => {
    expect(weekdayOfYmd("2026-10-14")).toBe(3); // Wednesday
    expect(weekdayOfYmd("2026-10-18")).toBe(0); // Sunday
  });

  it("the local date of an instant uses the shop's zone", () => {
    expect(localYmd(new Date("2026-10-15T02:30:00Z"), "America/Sao_Paulo")).toBe("2026-10-14");
    expect(localYmd(new Date("2026-10-15T02:30:00Z"), "UTC")).toBe("2026-10-15");
  });

  it("zonedTime builds the instant of a local date and time, and refuses nonsense", () => {
    expect(zonedTime("2026-10-14", "09:30", "America/Sao_Paulo")?.toISOString()).toBe("2026-10-14T12:30:00.000Z");
    expect(zonedTime("2026-10-14", "00:00", "America/Sao_Paulo")?.toISOString()).toBe("2026-10-14T03:00:00.000Z");
    expect(zonedTime("2026-02-30", "09:30", "America/Sao_Paulo")).toBeNull();
    expect(zonedTime("2026-10-14", "24:00", "America/Sao_Paulo")).toBeNull();
    expect(zonedTime("2026-10-14", "9:30", "America/Sao_Paulo")).toBeNull();
  });

  it("minutes of the day and their text", () => {
    expect(minutesOfDay(new Date("2026-10-14T12:30:00Z"), "America/Sao_Paulo")).toBe(9 * 60 + 30);
    expect(formatMinutes(9 * 60 + 5)).toBe("09:05");
  });

  it("month grid: Sunday first, full weeks, October 2026", () => {
    const weeks = monthWeeks("2026-10-14");
    expect(weeks[0][0].ymd).toBe("2026-09-27");
    expect(weeks[0][4]).toEqual({ ymd: "2026-10-01", inMonth: true });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.at(-1)?.some((d) => d.ymd === "2026-10-31")).toBe(true);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("a month that starts on Sunday and has 28 days is exactly 4 weeks", () => {
    const weeks = monthWeeks("2026-02-10"); // Feb 2026 starts on a Sunday
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0].ymd).toBe("2026-02-01");
  });

  it("shiftMonth gives the first day of another month, across years", () => {
    expect(shiftMonth("2026-10-14", 1)).toBe("2026-11-01");
    expect(shiftMonth("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-03-31", 0)).toBe("2026-03-01");
  });

  it("month and day titles in Portuguese", () => {
    expect(monthLabel("2026-10-14")).toBe("Outubro de 2026");
    expect(ymdTitle("2026-10-14")).toBe("Quarta-feira, 14/10");
  });
});
