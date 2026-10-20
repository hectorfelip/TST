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

// --- Calendar dates ("2026-10-14" text, no time zone) --------------------------------------------------

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-14" is a real calendar date? (rejects 2026-02-30, 2026-13-01...) */
export function isValidYmd(ymd: string): boolean {
  const m = YMD.exec(ymd);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** The local calendar date of an instant, in the barbershop's time zone. */
export function localYmd(date: Date, timeZone: string): string {
  const p = localParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Calendar arithmetic on dates without time zone: `n` days after (or before, if negative). */
export function addDaysYmd(ymd: string, n: number): string {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOfYmd(ymd: string): number {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** The instant of "HH:mm" on the local date `ymd`, or null if the date or the time is not valid. */
export function zonedTime(ymd: string, hhmm: string, timeZone: string): Date | null {
  if (!isValidYmd(ymd)) return null;
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!t) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const first = midnightAsUtc - offsetMinutes(new Date(midnightAsUtc), timeZone) * 60000;
  const midnight = midnightAsUtc - offsetMinutes(new Date(first), timeZone) * 60000;
  return new Date(midnight + (Number(t[1]) * 60 + Number(t[2])) * 60000);
}

/** Minutes since local midnight of an instant. */
export function minutesOfDay(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** "08:30" for 510. */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The weeks (Sunday first) that cover the month of `ymd`; days outside the month are marked. */
export function monthWeeks(ymd: string): { ymd: string; inMonth: boolean }[][] {
  const [year, month] = ymd.split("-").map(Number);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  let cursor = addDaysYmd(first, -weekdayOfYmd(first));
  const weeks: { ymd: string; inMonth: boolean }[][] = [];
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ ymd: cursor, inMonth: cursor.startsWith(`${year}-${String(month).padStart(2, "0")}-`) });
      cursor = addDaysYmd(cursor, 1);
    }
    weeks.push(week);
  } while (cursor.startsWith(`${year}-${String(month).padStart(2, "0")}-`) || weeks.length < 4);
  return weeks;
}

/** The first day of the month that is `n` months after (or before) the month of `ymd`. */
export function shiftMonth(ymd: string, n: number): string {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "Outubro de 2026". */
export function monthLabel(ymd: string): string {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

/** "Quarta-feira, 14/10" for a calendar date. */
export function ymdTitle(ymd: string): string {
  const m = YMD.exec(ymd);
  if (!m) throw new Error(`Invalid date: ${ymd}`);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${m[3]}/${m[2]}`;
}
