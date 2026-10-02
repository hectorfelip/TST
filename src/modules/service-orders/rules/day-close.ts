/**
 * Closing the day: what happens to the comandas that are still open.
 *
 * Owner feedback (step 3): blocking the cash register because of open
 * comandas made the owner cancel no-shows one by one before going home.
 * New rules:
 * - R-CSH-06: closing the register discards EMPTY open comandas automatically
 *   (e.g. opened in advance for a client who never came);
 * - comandas WITH items stay open as "pending" for the next register; their
 *   count and value go into the audit log (R-CSH-05);
 * - R-CMD-18: the owner can cancel many pending comandas at once, with one reason.
 */
import { requirePermission } from "@/modules/auth/rules/permissions";
import { closeRegister, type CashMovement, type CashRegister } from "@/modules/finance/rules/cash-register";
import type { AuditEntry } from "@/shared/audit";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { isValidReason } from "@/shared/text";
import { cancelComanda, comandaTotal, discardComanda, type Comanda } from "./comanda";

export type DayCloseResult = {
  register: CashRegister;
  /** Empty comandas discarded automatically. */
  discarded: Comanda[];
  /** Comandas with items that stay open for the next register. */
  pending: Comanda[];
  audits: AuditEntry[];
};

export function closeDay(
  ctx: TenantContext,
  input: {
    register: CashRegister | null;
    movements: readonly CashMovement[];
    /** All open comandas of the barbershop. */
    openComandas: readonly Comanda[];
    countedCash: Cents;
    reason: string | null;
    at: Date;
  },
): Result<DayCloseResult> {
  const allowed = requirePermission(ctx, "cash.close");
  if (!allowed.ok) return allowed;

  const mine = input.openComandas.filter((c) => c.barbershopId === ctx.barbershopId && c.status === "open");
  const pending = mine.filter((c) => c.items.length > 0);
  const pendingTotal = pending.reduce((sum, c) => sum + comandaTotal(c), 0);

  // Close the register first: if it fails, nothing is discarded.
  const closed = closeRegister(ctx, input.register, input.movements, {
    countedCash: input.countedCash,
    reason: input.reason,
    pending: { count: pending.length, total: pendingTotal },
    at: input.at,
  });
  if (!closed.ok) return closed;

  const discarded: Comanda[] = [];
  for (const comanda of mine.filter((c) => c.items.length === 0)) {
    const result = discardComanda(ctx, comanda, input.at);
    if (!result.ok) return result;
    discarded.push(result.value);
  }
  return ok({ register: closed.value.register, discarded, pending, audits: closed.value.audits });
}

/**
 * R-CMD-18: the owner cancels several open comandas at once with one reason
 * (e.g. "Cliente não compareceu"). Empty ones are discarded. All or nothing:
 * if one fails, none is changed. Each cancellation is still audited.
 */
export function cancelPendingComandas(
  ctx: TenantContext,
  comandas: readonly Comanda[],
  input: { reason: string; at: Date },
): Result<{ comandas: Comanda[]; audits: AuditEntry[] }> {
  const allowed = requirePermission(ctx, "comanda.edit_any");
  if (!allowed.ok) return allowed;
  if (comandas.length === 0) return fail("INVALID_INPUT", "Selecione pelo menos uma comanda.");
  if (!isValidReason(input.reason)) return fail("INVALID_INPUT", "Informe o motivo do cancelamento (mínimo 5 caracteres).");

  const changed: Comanda[] = [];
  const audits: AuditEntry[] = [];
  for (const comanda of comandas) {
    if (comanda.status !== "open") return fail("INVALID_STATE", `A comanda #${comanda.number} não está aberta.`);
    if (comanda.items.length === 0) {
      const discarded = discardComanda(ctx, comanda, input.at);
      if (!discarded.ok) return discarded;
      changed.push(discarded.value);
      continue;
    }
    const cancelled = cancelComanda(ctx, comanda, input, null);
    if (!cancelled.ok) return cancelled;
    changed.push(cancelled.value.comanda);
    audits.push(cancelled.value.audit);
  }
  return ok({ comandas: changed, audits });
}

/** A comanda opened before the current register = pending from a previous day. */
export function isPendingFromBefore(comanda: Pick<Comanda, "status" | "openedAt">, register: Pick<CashRegister, "openedAt"> | null): boolean {
  return comanda.status === "open" && register !== null && comanda.openedAt < register.openedAt;
}
