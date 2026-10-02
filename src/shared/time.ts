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

/** "14:05" in the barbershop's time zone. */
export function clockTime(date: Date, timeZone: string): string {
  const p = localParts(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** The instant of "HH:mm" on the local day `dayOffset` days from `now` (0 = today, 1 = tomorrow). null if the text is not a time. */
export function atLocalTime(now: Date, timeZone: string, dayOffset: number, hhmm: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  return new Date(startOfDay(now, timeZone, dayOffset).getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60000);
}

/** [from, to) of the local calendar month that contains `date`. */
export function monthRange(date: Date, timeZone: string): { from: Date; to: Date; label: string } {
  const p = localParts(date, timeZone);
  const first = (year: number, month: number) => {
    const midnightAsUtc = Date.UTC(year, month, 1);
    const guess = midnightAsUtc - offsetMinutes(new Date(midnightAsUtc), timeZone) * 60000;
    return new Date(midnightAsUtc - offsetMinutes(new Date(guess), timeZone) * 60000);
  };
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return { from: first(p.year, p.month - 1), to: first(p.year, p.month), label: `${months[p.month - 1]} ${p.year}` };
}

/** "Hoje", "Amanhã", "Ontem" or "02/10", relative to `now`, in the barbershop's time zone. */
export function relativeDay(date: Date, now: Date, timeZone: string): string {
  const start = date.getTime();
  for (const [offset, label] of [[0, "Hoje"], [1, "Amanhã"], [-1, "Ontem"]] as const) {
    const from = startOfDay(now, timeZone, offset).getTime();
    const to = startOfDay(now, timeZone, offset + 1).getTime();
    if (start >= from && start < to) return label;
  }
  const p = localParts(date, timeZone);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}`;
}

/** "Terça-feira 29/09" for the header of the day screens. */
export function dayTitle(now: Date, timeZone: string): string {
  const p = localParts(now, timeZone);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long" }).format(now);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}`;
}
