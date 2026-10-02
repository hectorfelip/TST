import type { Tx } from "@/db/client";
import type { CashMovement, CashMovementType, CashRegister, PaymentMethod } from "../rules/cash-register";

type RegisterRow = {
  id: string; barbershop_id: string; status: string; opened_at: Date; opened_by: string; opening_cash_cents: number; opening_reason: string | null;
  closed_at: Date | null; closed_by: string | null; counted_cash_cents: number | null; difference_cents: number | null; difference_reason: string | null;
  left_in_drawer_cents: number | null;
};
const COLUMNS = `id, barbershop_id, status, opened_at, opened_by, opening_cash_cents, opening_reason, closed_at, closed_by,
                 counted_cash_cents, difference_cents, difference_reason, left_in_drawer_cents`;
const toRegister = (r: RegisterRow): CashRegister => ({
  id: r.id, barbershopId: r.barbershop_id, status: r.status as CashRegister["status"], openedAt: r.opened_at, openedBy: r.opened_by,
  openingCash: r.opening_cash_cents, openingReason: r.opening_reason, closedAt: r.closed_at, closedBy: r.closed_by, countedCash: r.counted_cash_cents,
  difference: r.difference_cents, differenceReason: r.difference_reason, leftInDrawer: r.left_in_drawer_cents,
});

/**
 * The open register, if any. `lock` makes concurrent actions wait for each other:
 *  - "share"  : closing a comanda (many can run together, but none while the register is being closed);
 *  - "update" : closing the register (waits for the comandas being paid, and blocks new ones).
 */
export async function getOpenRegister(tx: Tx, lock?: "share" | "update"): Promise<CashRegister | null> {
  const suffix = lock === "update" ? " FOR UPDATE" : lock === "share" ? " FOR SHARE" : "";
  const r = await tx.maybeOne<RegisterRow>(`SELECT ${COLUMNS} FROM cash_registers WHERE status = 'open'${suffix}`);
  return r ? toRegister(r) : null;
}

export async function getRegister(tx: Tx, id: string): Promise<CashRegister | null> {
  const r = await tx.maybeOne<RegisterRow>(`SELECT ${COLUMNS} FROM cash_registers WHERE id = $1`, [id]);
  return r ? toRegister(r) : null;
}

/** The register closed most recently: its `leftInDrawer` is what the next opening is compared with (R-CSH-07). */
export async function getLastClosedRegister(tx: Tx): Promise<CashRegister | null> {
  const r = await tx.maybeOne<RegisterRow>(`SELECT ${COLUMNS} FROM cash_registers WHERE status = 'closed' ORDER BY closed_at DESC, opened_at DESC LIMIT 1`);
  return r ? toRegister(r) : null;
}

export async function insertRegister(tx: Tx, r: CashRegister): Promise<void> {
  await tx.query(
    `INSERT INTO cash_registers (id, barbershop_id, status, opened_at, opened_by, opening_cash_cents, opening_reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [r.id, r.barbershopId, r.status, r.openedAt, r.openedBy, r.openingCash, r.openingReason],
  );
}

export async function saveClosedRegister(tx: Tx, r: CashRegister): Promise<void> {
  await tx.query(
    `UPDATE cash_registers SET status = $2, closed_at = $3, closed_by = $4, counted_cash_cents = $5, difference_cents = $6,
                               difference_reason = $7, left_in_drawer_cents = $8 WHERE id = $1`,
    [r.id, r.status, r.closedAt, r.closedBy, r.countedCash, r.difference, r.differenceReason, r.leftInDrawer],
  );
}

export async function insertCashMovements(tx: Tx, movements: readonly CashMovement[]): Promise<void> {
  for (const m of movements) {
    await tx.query(
      `INSERT INTO cash_movements (barbershop_id, register_id, type, method, amount_cents, description, comanda_id, user_id, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [m.barbershopId, m.registerId, m.type, m.method, m.amount, m.description, m.comandaId, m.userId, m.at],
    );
  }
}

export async function listCashMovements(tx: Tx, registerId: string): Promise<CashMovement[]> {
  const rows = await tx.query<{
    barbershop_id: string; register_id: string; type: string; method: string; amount_cents: number; description: string;
    comanda_id: string | null; user_id: string; at: Date;
  }>(
    `SELECT barbershop_id, register_id, type, method, amount_cents, description, comanda_id, user_id, at
     FROM cash_movements WHERE register_id = $1 ORDER BY at, created_at, id`,
    [registerId],
  );
  return rows.map((r) => ({
    barbershopId: r.barbershop_id, registerId: r.register_id, type: r.type as CashMovementType, method: r.method as PaymentMethod,
    amount: r.amount_cents, description: r.description, comandaId: r.comanda_id, userId: r.user_id, at: r.at,
  }));
}
