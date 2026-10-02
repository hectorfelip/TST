/**
 * The daily job (run it once a day from a scheduler): pending comandas that
 * passed the barbershop's deadline are cancelled by the SYSTEM (R-CMD-22).
 * Barbershops that turned the option off are skipped.
 */
import type { Pool } from "pg";
import { insertAudit } from "@/db/audit";
import { withPublic, withTenant, type Tx } from "@/db/client";
import { getSettings } from "@/modules/barbershops/data/settings.repo";
import { pendingExpiry } from "@/modules/barbershops/rules/settings";
import { DAY_MS } from "@/shared/time";
import { expirePendingComandas } from "../rules/day-close";
import { listPending, saveComanda } from "./comandas.repo";

/** One barbershop. Locks the pending comandas, so it is safe to run twice at the same time. */
export async function expirePendingCmd(tx: Tx, at: Date): Promise<number> {
  const days = pendingExpiry(await getSettings(tx));
  if (days === null) return 0;
  const { comandas, audits } = expirePendingComandas(await listPending(tx, { lock: true }), at, days);
  for (const comanda of comandas) await saveComanda(tx, comanda);
  await insertAudit(tx, audits);
  return comandas.length;
}

/**
 * All barbershops. No barbershop can see the others, so the ids come from a small database function (migration 005):
 * the running app never needs the owner's password. The work itself runs as the application role,
 * one transaction per barbershop, with the user "system".
 */
export async function runExpiryJob(appPool: Pool, at = new Date()): Promise<{ barbershops: number; cancelled: number }> {
  const ids = await withPublic(appPool, (tx) => tx.query<{ id: string }>("SELECT list_barbershop_ids() AS id"));
  let cancelled = 0;
  for (const shop of ids) {
    cancelled += await withTenant(appPool, { barbershopId: shop.id, userId: "system" }, (tx) => expirePendingCmd(tx, at));
  }
  return { barbershops: ids.length, cancelled };
}

/** Housekeeping: idempotency keys older than 30 days are useless (a retry never comes that late). */
export function forgetOldKeys(appPool: Pool, now = new Date()): Promise<number> {
  return withPublic(appPool, async (tx) => (await tx.one<{ n: number }>("SELECT forget_old_idempotency_keys($1) AS n", [new Date(now.getTime() - 30 * DAY_MS)])).n);
}
