/**
 * Time helpers. "Today" and "tomorrow" always use the BARBERSHOP's time zone,
 * never the server's: a server in UTC would say it is already tomorrow at 21h
 * in São Paulo (UTC-3), and the agenda would show the wrong day.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Minutes between the time zone and UTC at that instant (São Paulo = -180). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The instant when the local day starts (00:00 in the time zone). `dayOffset` 1 = tomorrow. */
export function startOfDay(date: Date, timeZone: string, dayOffset = 0): Date {
  const p = localParts(date, timeZone);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + dayOffset);
  const first = midnightAsUtc - offsetMinutes(new Date(midnightAsUtc), timeZone) * 60000;
  return new Date(midnightAsUtc - offsetMinutes(new Date(first), timeZone) * 60000);
}

/** [from, to) of a local day. */
export function dayRange(date: Date, timeZone: string, dayOffset = 0): { from: Date; to: Date } {
  return { from: startOfDay(date, timeZone, dayOffset), to: startOfDay(date, timeZone, dayOffset + 1) };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
