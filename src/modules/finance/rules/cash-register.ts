import { requirePermission } from "@/modules/auth/rules/permissions";
import type { AuditEntry } from "@/shared/audit";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import { assertSameTenant, type TenantContext } from "@/shared/tenant";
import { isValidReason } from "@/shared/text";

export type PaymentMethod = "cash" | "pix" | "debit" | "credit";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "pix", "debit", "credit"];

export type CashRegister = {
  id: string;
  barbershopId: string;
  status: "open" | "closed";
  openedAt: Date;
  openedBy: string;
  openingCash: Cents;
  closedAt: Date | null;
  closedBy: string | null;
  countedCash: Cents | null;
  /** counted − expected. Positive = extra money, negative = missing money. */
  difference: Cents | null;
  differenceReason: string | null;
  /** Cash that stays in the drawer for the next day. Defaults to the counted cash. */
  leftInDrawer: Cents | null;
  /** Why the opening cash was different from what was left yesterday (null = same). */
  openingReason: string | null;
};

export type CashMovementType = "opening" | "sale" | "sale_reversal" | "payment_correction" | "expense" | "withdrawal";

export type CashMovement = {
  barbershopId: string;
  registerId: string;
  type: CashMovementType;
  method: PaymentMethod;
  /** Positive = money in, negative = money out. */
  amount: Cents;
  description: string;
  comandaId: string | null;
  userId: string;
  at: Date;
};

/** What the opening cash should be: the cash that was left in the drawer at the last closing. */
export function suggestedOpeningCash(previousClosed: CashRegister | null): Cents | null {
  return previousClosed?.leftInDrawer ?? null;
}

/**
 * R-CSH-01 (revised after owner feedback): the owner OR a barber opens the
 * register; only one open register per barbershop.
 * R-CSH-07: the opening cash must match what was left in the drawer at the
 * last closing. A different value needs a reason and is audited — otherwise
 * whoever opens could declare less cash and keep the difference.
 */
export function openRegister(
  ctx: TenantContext,
  input: { id: string; openingCash: Cents; reason: string | null; at: Date },
  currentOpen: CashRegister | null,
  previousClosed: CashRegister | null,
): Result<{ register: CashRegister; movement: CashMovement; audit: AuditEntry | null }> {
  const allowed = requirePermission(ctx, "cash.open");
  if (!allowed.ok) return allowed;
  if (currentOpen && currentOpen.barbershopId === ctx.barbershopId) {
    return fail("INVALID_STATE", "Já existe um caixa aberto. Feche-o antes de abrir outro.");
  }
  if (!Number.isInteger(input.openingCash) || input.openingCash < 0) {
    return fail("INVALID_INPUT", "Troco inicial não pode ser negativo.");
  }
  if (previousClosed) {
    const tenant = assertSameTenant(ctx, previousClosed);
    if (!tenant.ok) return tenant;
  }
  const expected = suggestedOpeningCash(previousClosed);
  const differs = expected !== null && input.openingCash !== expected;
  if (differs && !isValidReason(input.reason)) {
    return fail("INVALID_INPUT", "O troco inicial é diferente do que ficou na gaveta no último fechamento. Informe o motivo (mínimo 5 caracteres).");
  }
  const register: CashRegister = {
    id: input.id,
    barbershopId: ctx.barbershopId,
    status: "open",
    openedAt: input.at,
    openedBy: ctx.userId,
    openingCash: input.openingCash,
    closedAt: null,
    closedBy: null,
    countedCash: null,
    difference: null,
    differenceReason: null,
    leftInDrawer: null,
    openingReason: differs ? (input.reason ?? "").trim() : null,
  };
  const audit: AuditEntry | null =
    differs && expected !== null
      ? {
          barbershopId: ctx.barbershopId,
          action: "cash.opened_with_difference",
          userId: ctx.userId,
          at: input.at,
          entityId: register.id,
          details: { expected, opening: input.openingCash, difference: input.openingCash - expected, reason: register.openingReason },
        }
      : null;
  return ok({
    register,
    movement: movement(register, ctx.userId, "opening", "cash", input.openingCash, "Abertura do caixa (troco)", null, input.at),
    audit,
  });
}

export function movement(
  register: CashRegister,
  userId: string,
  type: CashMovementType,
  method: PaymentMethod,
  amount: Cents,
  description: string,
  comandaId: string | null,
  at: Date,
): CashMovement {
  return { barbershopId: register.barbershopId, registerId: register.id, type, method, amount, description, comandaId, userId, at };
}

/** Used by every rule that needs the register to be open (sales, expenses, corrections). */
export function requireOpenRegister(ctx: TenantContext, register: CashRegister | null): Result<CashRegister> {
  if (!register || register.status !== "open") {
    return fail("INVALID_STATE", "O caixa está fechado. Peça ao dono para abrir o caixa.");
  }
  const tenant = assertSameTenant(ctx, register);
  if (!tenant.ok) return tenant;
  return ok(register);
}

/**
 * R-CSH-02: only physical cash is in the drawer. Pix and cards never count.
 * expected = opening + cash sales − cash reversals − cash expenses − withdrawals ± corrections.
 */
export function expectedCash(movements: readonly CashMovement[]): Cents {
  return movements.filter((m) => m.method === "cash").reduce((sum, m) => sum + m.amount, 0);
}

/** Money received from comandas per method (opening, expenses and withdrawals excluded). */
export function salesByMethod(movements: readonly CashMovement[]): Record<PaymentMethod, Cents> {
  const totals: Record<PaymentMethod, Cents> = { cash: 0, pix: 0, debit: 0, credit: 0 };
  for (const m of movements) {
    if (m.type === "sale" || m.type === "sale_reversal" || m.type === "payment_correction") totals[m.method] += m.amount;
  }
  return totals;
}

/** R-CSH-03: expenses are owner-only, positive, described, and can be paid by any method. */
export function recordExpense(
  ctx: TenantContext,
  register: CashRegister | null,
  input: { amount: Cents; method: PaymentMethod; description: string; at: Date },
): Result<CashMovement> {
  const allowed = requirePermission(ctx, "cash.expense");
  if (!allowed.ok) return allowed;
  const open = requireOpenRegister(ctx, register);
  if (!open.ok) return open;
  if (!Number.isInteger(input.amount) || input.amount <= 0) return fail("INVALID_INPUT", "Valor da despesa deve ser maior que zero.");
  if (input.description.trim().length < 3) return fail("INVALID_INPUT", "Descreva a despesa.");
  return ok(movement(open.value, ctx.userId, "expense", input.method, -input.amount, `Despesa: ${input.description.trim()}`, null, input.at));
}

/**
 * R-CSH-04: a withdrawal (sangria) takes cash out of the drawer. It can never
 * be bigger than the cash that should be there, needs a reason and is audited.
 */
export function recordWithdrawal(
  ctx: TenantContext,
  register: CashRegister | null,
  movements: readonly CashMovement[],
  input: { amount: Cents; reason: string; at: Date },
): Result<{ movement: CashMovement; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "cash.withdrawal");
  if (!allowed.ok) return allowed;
  const open = requireOpenRegister(ctx, register);
  if (!open.ok) return open;
  if (!Number.isInteger(input.amount) || input.amount <= 0) return fail("INVALID_INPUT", "Valor da retirada deve ser maior que zero.");
  if (input.amount > expectedCash(movements)) return fail("NOT_ALLOWED", "Retirada maior que o dinheiro esperado na gaveta.");
  if (!isValidReason(input.reason)) return fail("INVALID_INPUT", "Informe o motivo da retirada (mínimo 5 caracteres).");
  return ok({
    movement: movement(open.value, ctx.userId, "withdrawal", "cash", -input.amount, `Retirada: ${input.reason.trim()}`, null, input.at),
    audit: {
      barbershopId: ctx.barbershopId,
      action: "cash.withdrawal",
      userId: ctx.userId,
      at: input.at,
      entityId: open.value.id,
      details: { amount: input.amount, reason: input.reason.trim() },
    },
  });
}

/**
 * R-CSH-05 (revised after owner feedback): closing the register.
 * - owner only;
 * - NOT blocked by open comandas: comandas with items stay pending for the
 *   next register (see `closeDay` in service-orders), and their number and
 *   value are recorded in the audit log so they are never silently ignored;
 * - the counted cash is compared with the expected cash;
 * - any difference needs a reason and is audited. The difference is recorded,
 *   never "fixed" by changing numbers;
 * - `leftInDrawer` = the cash that stays for tomorrow (default: all of it).
 *   The next opening is compared with it (R-CSH-07).
 * Only the owner closes. (A future "cashier" role may also close.)
 */
export function closeRegister(
  ctx: TenantContext,
  register: CashRegister | null,
  movements: readonly CashMovement[],
  input: { countedCash: Cents; leftInDrawer?: Cents; reason: string | null; pending: { count: number; total: Cents }; at: Date },
): Result<{ register: CashRegister; audits: AuditEntry[] }> {
  const allowed = requirePermission(ctx, "cash.close");
  if (!allowed.ok) return allowed;
  const open = requireOpenRegister(ctx, register);
  if (!open.ok) return open;
  if (!Number.isInteger(input.countedCash) || input.countedCash < 0) return fail("INVALID_INPUT", "Valor contado inválido.");
  const left = input.leftInDrawer ?? input.countedCash;
  if (!Number.isInteger(left) || left < 0 || left > input.countedCash) {
    return fail("INVALID_INPUT", "O troco que fica na gaveta não pode ser maior que o dinheiro contado.");
  }
  const difference = input.countedCash - expectedCash(movements);
  if (difference !== 0 && !isValidReason(input.reason)) {
    return fail("INVALID_INPUT", "Informe o motivo da diferença (mínimo 5 caracteres).");
  }
  const closed: CashRegister = {
    ...open.value,
    status: "closed",
    closedAt: input.at,
    closedBy: ctx.userId,
    countedCash: input.countedCash,
    difference,
    differenceReason: difference === 0 ? null : (input.reason ?? "").trim(),
    leftInDrawer: left,
  };
  const base = { barbershopId: ctx.barbershopId, userId: ctx.userId, at: input.at, entityId: closed.id };
  const audits: AuditEntry[] = [];
  if (difference !== 0) {
    audits.push({ ...base, action: "cash.closed_with_difference", details: { difference, reason: closed.differenceReason } });
  }
  if (input.pending.count > 0) {
    audits.push({ ...base, action: "cash.closed_with_pending", details: { count: input.pending.count, total: input.pending.total } });
  }
  return ok({ register: closed, audits });
}
