import type { Tx } from "@/db/client";
import { DAY_MS } from "@/shared/time";
import type { Interval } from "../rules/slots";

export type BookableBarber = { id: string; name: string };

/** Active people who accept online bookings (the owner too, if he cuts hair and kept the switch ON). */
export async function listBookableBarbers(tx: Tx): Promise<BookableBarber[]> {
  return tx.query<BookableBarber>("SELECT id, name FROM employees WHERE active AND takes_online_bookings ORDER BY name");
}

/**
 * What each barber already has in [from, to): open appointments, confirmed OR waiting for approval (both hold the time).
 * A declined or cancelled booking is no longer open, so it frees the time again.
 */
export async function busyByBarber(tx: Tx, barberIds: readonly string[], from: Date, to: Date, defaultMinutes: number): Promise<Map<string, Interval[]>> {
  const rows = await tx.query<{ barber_id: string; at: Date; minutes: number | null }>(
    `SELECT appointment_barber_id AS barber_id, appointment_at AS at, appointment_minutes AS minutes
     FROM comandas
     WHERE status = 'open' AND appointment_at >= $1 AND appointment_at < $2 AND appointment_barber_id = ANY($3::uuid[])`,
    [from, to, barberIds],
  );
  const map = new Map<string, Interval[]>(barberIds.map((id) => [id, []]));
  for (const r of rows) map.get(r.barber_id)?.push({ start: r.at, end: new Date(r.at.getTime() + (r.minutes ?? defaultMinutes) * 60000) });
  return map;
}

/** Online bookings of this client that are still open and in the future. */
export async function countOpenOnlineForClient(tx: Tx, clientId: string, now: Date): Promise<number> {
  return (
    await tx.one<{ n: number }>(
      "SELECT count(*)::int AS n FROM comandas WHERE client_id = $1 AND source = 'online' AND status = 'open' AND appointment_at > $2",
      [clientId, now],
    )
  ).n;
}

export async function countFromAddressSince(tx: Tx, ipHash: string, since: Date): Promise<number> {
  return (await tx.one<{ n: number }>("SELECT count(*)::int AS n FROM comandas WHERE online_ip_hash = $1 AND created_at >= $2", [ipHash, since])).n;
}

export async function countOnlineForShopSince(tx: Tx, since: Date): Promise<number> {
  return (await tx.one<{ n: number }>("SELECT count(*)::int AS n FROM comandas WHERE source = 'online' AND created_at >= $1", [since])).n;
}

export async function setTakesOnline(tx: Tx, employeeId: string, value: boolean): Promise<boolean> {
  const rows = await tx.query("UPDATE employees SET takes_online_bookings = $2 WHERE id = $1 RETURNING id", [employeeId, value]);
  return rows.length === 1;
}

export async function takesOnlineById(tx: Tx): Promise<Map<string, boolean>> {
  const rows = await tx.query<{ id: string; takes: boolean }>("SELECT id, takes_online_bookings AS takes FROM employees");
  return new Map(rows.map((r) => [r.id, r.takes]));
}

export const HOUR_MS = DAY_MS / 24;
