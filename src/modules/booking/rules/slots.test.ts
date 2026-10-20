import { describe, expect, it } from "vitest";
import { zonedTime } from "@/shared/time";
import { availableSlots, isFree, pickAnyBarber, withinOpening, type Candidate } from "./slots";
import { DEFAULT_BOOKING_SETTINGS } from "./settings";

const TZ = "America/Sao_Paulo";
const NOW = new Date("2026-10-14T12:00:00Z"); // Wednesday 09:00 in São Paulo
const rules = DEFAULT_BOOKING_SETTINGS; // Mon-Sat, 09:00-19:00, 30 min, 60 min notice
const at = (ymd: string, hhmm: string) => zonedTime(ymd, hhmm, TZ) as Date;
const busy = (ymd: string, from: string, to: string) => ({ start: at(ymd, from), end: at(ymd, to) });
const barber = (id: string, name: string, intervals: ReturnType<typeof busy>[] = [], bookingsThatDay = 0): Candidate => ({ id, name, busy: intervals, bookingsThatDay });

describe("availableSlots", () => {
  it("a free day lists every slot of the opening hours; the last one still ends before closing", () => {
    const slots = availableSlots({ ymd: "2026-10-15", timeZone: TZ, now: NOW, rules, durationMinutes: 30, candidates: [barber("b1", "Rafael")] });
    expect(slots[0].time).toBe("09:00");
    expect(slots.at(-1)?.time).toBe("18:30");
    expect(slots).toHaveLength(20);
  });

  it("a longer service needs more room: a 90-minute service cannot start at 18:00", () => {
    const slots = availableSlots({ ymd: "2026-10-15", timeZone: TZ, now: NOW, rules, durationMinutes: 90, candidates: [barber("b1", "Rafael")] });
    expect(slots.at(-1)?.time).toBe("17:30");
  });

  it("a busy barber hides the times he cannot take, including the ones that would overlap the end of his appointment", () => {
    const slots = availableSlots({
      ymd: "2026-10-15", timeZone: TZ, now: NOW, rules, durationMinutes: 60,
      candidates: [barber("b1", "Rafael", [busy("2026-10-15", "10:00", "11:00")])],
    });
    const times = slots.map((s) => s.time);
    expect(times).toContain("09:00"); // 09:00-10:00 fits right before
    expect(times).not.toContain("09:30"); // would run into 10:00
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:00"); // 11:00-12:00 right after
  });

  it("a time is offered if AT LEAST ONE barber is free, and says which", () => {
    const slots = availableSlots({
      ymd: "2026-10-15", timeZone: TZ, now: NOW, rules, durationMinutes: 30,
      candidates: [barber("b1", "Rafael", [busy("2026-10-15", "09:00", "09:30")]), barber("b2", "Diego")],
    });
    expect(slots[0]).toMatchObject({ time: "09:00", barberIds: ["b2"] });
    expect(slots[1]).toMatchObject({ time: "09:30", barberIds: ["b1", "b2"] });
  });

  it("when everybody is busy the time disappears", () => {
    const full = [busy("2026-10-15", "09:00", "19:00")];
    expect(availableSlots({ ymd: "2026-10-15", timeZone: TZ, now: NOW, rules, durationMinutes: 30, candidates: [barber("b1", "R", full)] })).toEqual([]);
  });

  it("closed days (Sunday) have no slots", () => {
    expect(availableSlots({ ymd: "2026-10-18", timeZone: TZ, now: NOW, rules, durationMinutes: 30, candidates: [barber("b1", "R")] })).toEqual([]);
  });

  it("times too soon are hidden (minimum notice), today's past times too", () => {
    const slots = availableSlots({ ymd: "2026-10-14", timeZone: TZ, now: NOW, rules, durationMinutes: 30, candidates: [barber("b1", "R")] });
    expect(slots[0].time).toBe("10:00"); // now is 09:00, notice 60 min: 10:00 is the first one allowed
  });

  it("beyond the 14-day window nothing is offered", () => {
    expect(availableSlots({ ymd: "2026-11-20", timeZone: TZ, now: NOW, rules, durationMinutes: 30, candidates: [barber("b1", "R")] })).toEqual([]);
  });

  it("the time zone of the barbershop decides the hours, not the server's", () => {
    const slots = availableSlots({ ymd: "2026-10-15", timeZone: "UTC", now: NOW, rules, durationMinutes: 30, candidates: [barber("b1", "R")] });
    expect(slots[0].startsAt.toISOString()).toBe("2026-10-15T09:00:00.000Z");
  });
});

describe("withinOpening", () => {
  const base = { ymd: "2026-10-15", timeZone: TZ, now: NOW, rules, durationMinutes: 30 };
  it("accepts a normal time and refuses before opening, after closing, Sundays and the past", () => {
    expect(withinOpening({ ...base, startsAt: at("2026-10-15", "10:00") })).toBe(true);
    expect(withinOpening({ ...base, startsAt: at("2026-10-15", "08:30") })).toBe(false);
    expect(withinOpening({ ...base, startsAt: at("2026-10-15", "18:45") })).toBe(false); // ends 19:15
    expect(withinOpening({ ...base, ymd: "2026-10-18", startsAt: at("2026-10-18", "10:00") })).toBe(false);
    expect(withinOpening({ ...base, ymd: "2026-10-14", startsAt: at("2026-10-14", "09:30") })).toBe(false); // inside the notice
  });
});

describe("isFree and pickAnyBarber", () => {
  it("touching appointments are fine; overlapping ones are not", () => {
    const c = barber("b1", "R", [busy("2026-10-15", "10:00", "10:30")]);
    expect(isFree(c, at("2026-10-15", "09:30"), 30)).toBe(true);
    expect(isFree(c, at("2026-10-15", "10:30"), 30)).toBe(true);
    expect(isFree(c, at("2026-10-15", "10:15"), 30)).toBe(false);
  });

  it("'any barber' is the one with fewer bookings that day, then by name", () => {
    expect(pickAnyBarber([barber("b1", "Rafael", [], 3), barber("b2", "Diego", [], 1)])?.id).toBe("b2");
    expect(pickAnyBarber([barber("b1", "Rafael", [], 2), barber("b2", "Diego", [], 2)])?.id).toBe("b2");
    expect(pickAnyBarber([])).toBeNull();
  });
});
