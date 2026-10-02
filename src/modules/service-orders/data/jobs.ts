/**
 * The daily job (run it once a day from a scheduler): pending comandas that
 * passed the barbershop's deadline are cancelled by the SYSTEM (R-CMD-22).
 * Barbershops that turned the option off are skipped.
 */
import type { Pool } from "pg";
import { insertAudit } from "@/db/audit";
import { withTenant, type Tx } from "@/db/client";
import { getSettings } from "@/modules/barbershops/data/settings.repo";
import { pendingExpiry } from "@/modules/barbershops/rules/settings";
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
 * All barbershops. Listing them needs the OWNER connection (`adminPool`): no
 * barbershop can see the others. The work itself runs as the application
 * role, one transaction per barbershop, with the user "system".
 */
export async function runExpiryJob(appPool: Pool, adminPool: Pool, at = new Date()): Promise<{ barbershops: number; cancelled: number }> {
  const { rows } = await adminPool.query<{ id: string }>("SELECT id FROM barbershops ORDER BY created_at");
  let cancelled = 0;
  for (const shop of rows) {
    cancelled += await withTenant(appPool, { barbershopId: shop.id, userId: "system" }, (tx) => expirePendingCmd(tx, at));
  }
  return { barbershops: rows.length, cancelled };
}
