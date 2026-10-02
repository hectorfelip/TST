import type { Tx } from "@/db/client";
import type { BarbershopSettings } from "../rules/settings";

type Row = { away_after_days: number; auto_cancel_pending: boolean; pending_expiry_days: number; time_zone: string };

/** Settings of the current barbershop (Row Level Security leaves only one row). */
export async function getSettings(tx: Tx): Promise<BarbershopSettings> {
  const r = await tx.one<Row>("SELECT away_after_days, auto_cancel_pending, pending_expiry_days, time_zone FROM barbershops");
  return { awayAfterDays: r.away_after_days, autoCancelPending: r.auto_cancel_pending, pendingExpiryDays: r.pending_expiry_days, timeZone: r.time_zone };
}

export async function saveSettings(tx: Tx, s: BarbershopSettings): Promise<void> {
  await tx.query(
    `UPDATE barbershops SET away_after_days = $1, auto_cancel_pending = $2, pending_expiry_days = $3, time_zone = $4`,
    [s.awayAfterDays, s.autoCancelPending, s.pendingExpiryDays, s.timeZone],
  );
}

/**
 * Takes a lock on the barbershop row. Used by actions that must not run twice
 * at the same time for the same barbershop (e.g. changing who the owners are).
 */
export async function lockBarbershop(tx: Tx): Promise<void> {
  await tx.one("SELECT id FROM barbershops FOR UPDATE");
}
