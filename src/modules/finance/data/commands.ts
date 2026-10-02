/**
 * Cash register actions: load → apply the rule → save every effect in ONE transaction.
 * Call them inside `withTenant`. A rule that refuses returns { ok: false } and writes nothing.
 */
import { randomUUID } from "node:crypto";
import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { guarded } from "@/db/errors";
import type { Cents } from "@/shared/money";
import { ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import {
  expectedCash,
  openRegister,
  recordExpense,
  recordWithdrawal,
  salesByMethod,
  type CashMovement,
  type CashRegister,
  type PaymentMethod,
} from "../rules/cash-register";
import { getLastClosedRegister, getOpenRegister, insertCashMovements, insertRegister, listCashMovements } from "./registers.repo";

/** R-CSH-01/07: the owner or a barber opens it; the amount is compared with what was left at the last closing. */
export async function openRegisterCmd(
  tx: Tx,
  ctx: TenantContext,
  input: { openingCash: Cents; reason?: string | null; at?: Date },
): Promise<Result<CashRegister>> {
  const at = input.at ?? new Date();
  const opened = openRegister(ctx, { id: randomUUID(), openingCash: input.openingCash, reason: input.reason ?? null, at }, await getOpenRegister(tx), await getLastClosedRegister(tx));
  if (!opened.ok) return opened;
  // Two people opening at the same instant: the database accepts only one (one_open_register_per_shop).
  return guarded(async () => {
    await insertRegister(tx, opened.value.register);
    await insertCashMovements(tx, [opened.value.movement]);
    if (opened.value.audit) await insertAudit(tx, [opened.value.audit]);
    return ok(opened.value.register);
  });
}

export async function recordExpenseCmd(
  tx: Tx,
  ctx: TenantContext,
  input: { amount: Cents; method: PaymentMethod; description: string; at?: Date },
): Promise<Result<CashMovement>> {
  const movement = recordExpense(ctx, await getOpenRegister(tx, "share"), { ...input, at: input.at ?? new Date() });
  if (!movement.ok) return movement;
  await insertCashMovements(tx, [movement.value]);
  return movement;
}

/** The register is locked: two withdrawals at once cannot together take more cash than the drawer has (R-CSH-04). */
export async function recordWithdrawalCmd(
  tx: Tx,
  ctx: TenantContext,
  input: { amount: Cents; reason: string; at?: Date },
): Promise<Result<CashMovement>> {
  const register = await getOpenRegister(tx, "update");
  const movements = register ? await listCashMovements(tx, register.id) : [];
  const result = recordWithdrawal(ctx, register, movements, { ...input, at: input.at ?? new Date() });
  if (!result.ok) return result;
  await insertCashMovements(tx, [result.value.movement]);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.movement);
}

export type RegisterReport = {
  register: CashRegister;
  movements: CashMovement[];
  /** R-CSH-02: only cash. Pix and cards never enter the drawer. */
  expectedCash: Cents;
  salesByMethod: Record<PaymentMethod, Cents>;
};

/** Everything the cash register screen shows. Derived from the movements, nothing is stored. */
export async function getOpenRegisterReport(tx: Tx): Promise<RegisterReport | null> {
  const register = await getOpenRegister(tx);
  if (!register) return null;
  const movements = await listCashMovements(tx, register.id);
  return { register, movements, expectedCash: expectedCash(movements), salesByMethod: salesByMethod(movements) };
}
