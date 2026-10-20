/**
 * Which times can a client book? Pure maths: opening hours, how long the service takes, who is already busy.
 * The same function answers two questions: "show me the free times" (the public page) and "is THIS time still free?"
 * (the moment of booking, with the barbershop locked), so the page can never promise what the server would refuse.
 */
import { addDaysYmd, formatMinutes, weekdayOfYmd, zonedTime } from "@/shared/time";
import { isOpenOn, type BookingSettings } from "./settings";

export type Interval = { start: Date; end: Date };

/** A barber who can be booked, with what he already has on the agenda around the day. */
export type Candidate = { id: string; name: string; busy: readonly Interval[]; bookingsThatDay: number };

export type Slot = { time: string; startsAt: Date; barberIds: string[] };

export const BOOKING_HORIZON_DAYS = 14;

const overlaps = (a: Interval, b: Interval) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

export function isFree(candidate: Candidate, start: Date, minutes: number): boolean {
  const wanted = { start, end: new Date(start.getTime() + minutes * 60000) };
  return !candidate.busy.some((b) => overlaps(b, wanted));
}

type Rules = Pick<BookingSettings, "openDays" | "openMinute" | "closeMinute" | "slotMinutes" | "minNoticeMinutes">;

/** Does a service starting at `startsAt` fit the opening hours, the notice and the booking window? (Says nothing about who is free.) */
export function withinOpening(input: { startsAt: Date; ymd: string; timeZone: string; now: Date; rules: Rules; durationMinutes: number }): boolean {
  const { startsAt, ymd, timeZone, now, rules, durationMinutes } = input;
  if (!isOpenOn(rules.openDays, weekdayOfYmd(ymd))) return false;
  const open = zonedTime(ymd, formatMinutes(rules.openMinute), timeZone);
  const close = rules.closeMinute >= 24 * 60 ? zonedTime(addDaysYmd(ymd, 1), "00:00", timeZone) : zonedTime(ymd, formatMinutes(rules.closeMinute), timeZone);
  if (!open || !close) return false;
  const end = startsAt.getTime() + durationMinutes * 60000;
  if (startsAt.getTime() < open.getTime() || end > close.getTime()) return false;
  if (startsAt.getTime() < now.getTime() + rules.minNoticeMinutes * 60000) return false;
  if (startsAt.getTime() > now.getTime() + BOOKING_HORIZON_DAYS * 24 * 60 * 60000) return false;
  return true;
}

/** The free times of one local day: each one lists the barbers who are free for the whole service. Empty if closed or full. */
export function availableSlots(input: {
  ymd: string;
  timeZone: string;
  now: Date;
  rules: Rules;
  durationMinutes: number;
  candidates: readonly Candidate[];
}): Slot[] {
  const { ymd, timeZone, now, rules, durationMinutes, candidates } = input;
  if (!isOpenOn(rules.openDays, weekdayOfYmd(ymd))) return [];
  const slots: Slot[] = [];
  for (let minute = rules.openMinute; minute + durationMinutes <= rules.closeMinute; minute += rules.slotMinutes) {
    const startsAt = zonedTime(ymd, formatMinutes(minute), timeZone);
    if (!startsAt) continue;
    if (!withinOpening({ startsAt, ymd, timeZone, now, rules, durationMinutes })) continue;
    const free = candidates.filter((c) => isFree(c, startsAt, durationMinutes));
    if (free.length > 0) slots.push({ time: formatMinutes(minute), startsAt, barberIds: free.map((c) => c.id) });
  }
  return slots;
}

/** "Any barber": the free one with the fewest bookings that day (fair), then by name (predictable). */
export function pickAnyBarber(candidates: readonly Candidate[]): Candidate | null {
  return [...candidates].sort((a, b) => a.bookingsThatDay - b.bookingsThatDay || a.name.localeCompare(b.name, "pt-BR"))[0] ?? null;
}
