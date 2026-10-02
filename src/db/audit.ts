import type { AuditEntry } from "@/shared/audit";
import type { Tx } from "./client";

/** Saves audit entries in the SAME transaction as the change they describe. */
export async function insertAudit(tx: Tx, entries: readonly AuditEntry[]): Promise<void> {
  for (const entry of entries) {
    await tx.query(
      `INSERT INTO audit_log (barbershop_id, action, user_id, at, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.barbershopId, entry.action, entry.userId, entry.at, entry.entityId, JSON.stringify(entry.details)],
    );
  }
}

export async function listAudit(tx: Tx, filter: { action?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const rows = await tx.query<{ barbershop_id: string; action: string; user_id: string; at: Date; entity_id: string; details: AuditEntry["details"] }>(
    `SELECT barbershop_id, action, user_id, at, entity_id, details FROM audit_log
     WHERE ($1::text IS NULL OR action = $1) ORDER BY id DESC LIMIT $2`,
    [filter.action ?? null, filter.limit ?? 100],
  );
  return rows.map((r) => ({
    barbershopId: r.barbershop_id,
    action: r.action as AuditEntry["action"],
    userId: r.user_id,
    at: r.at,
    entityId: r.entity_id,
    details: r.details,
  }));
}
