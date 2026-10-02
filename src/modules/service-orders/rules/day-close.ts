/**
 * Closing the day: what happens to the comandas that are still open.
 *
 * Owner feedback (step 3), in order:
 * 1. Open comandas must not block the register (the owner would have to
 *    cancel no-shows one by one just to go home).
 * 2. At closing, EVERY unpaid service is shown to the owner, and nothing is
 *    decided before he has seen it: each comanda needs an explicit decision.
 * 3. Barbers do not cancel. "Client did not come" = no-show (paused, recorded),
 *    never a cancellation.
 * 4. Every option needs a confirmation step (`confirmed`) to avoid mistakes.
 * 5. Pending comandas expire after N days (default 5) and are then cancelled.
 *
 * What the owner can decide, per comanda:
 *
 *   unpaid, appointment   → no_show | keep_pending   (or go and receive payment)
 *   unpaid, walk-in       → keep_pending             (or go and receive/cancel)
 *   empty, appointment    → no_show
 *   empty, walk-in        → discard
 *   no-show WITH items, marked by a barber today → reviewed (the owner checks it)
 */
import { requirePermission } from "@/modules/auth/rules/permissions";
import {
  closeRegister,
  requireOpenRegister,
  type CashMovement,
  type CashRegister,
} from "@/modules/finance/rules/cash-register";
import type { AuditEntry } from "@/shared/audit";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { DAY_MS } from "@/shared/time";
import { comandaTotal, discardComanda, markNoShow, type Comanda } from "./comanda";

export type DayDecision = "no_show" | "keep_pending" | "discard" | "reviewed";
export type DayEntryKind = "unpaid" | "empty" | "no_show_with_items";

export type DayCloseEntry = {
  comanda: Comanda;
  kind: DayEntryKind;
  total: Cents;
  options: DayDecision[];
  /** Days left before a pending comanda expires; null if it is not pending yet. */
  expiresInDays: number | null;
};

export type DayClosePlan = {
  entries: DayCloseEntry[];
  /** Value of services that were not paid (unpaid + no-shows that had items). The money "at risk". */
  atRiskTotal: Cents;
};

/** Whole days left until a pending comanda is cancelled (0 = expires today). */
export function pendingDaysLeft(comanda: Pick<Comanda, "pendingSince">, now: Date, expiryDays: number): number | null {
  if (!comanda.pendingSince) return null;
  const expiresAt = comanda.pendingSince.getTime() + expiryDays * DAY_MS;
  return Math.max(0, Math.ceil((expiresAt - now.getTime()) / DAY_MS));
}

/**
 * Builds the list the owner must go through before closing the register.
 * `comandas` = open comandas plus the no-shows of the day. Appointments for
 * later (after `at`) are not part of this closing and are ignored.
 */
export function planDayClose(
  ctx: TenantContext,
  input: { register: CashRegister | null; comandas: readonly Comanda[]; expiryDays: number; at: Date },
): Result<DayClosePlan> {
  const allowed = requirePermission(ctx, "cash.close");
  if (!allowed.ok) return allowed;
  const open = requireOpenRegister(ctx, input.register);
  if (!open.ok) return open;

  const entries: DayCloseEntry[] = [];
  for (const comanda of input.comandas) {
    if (comanda.barbershopId !== ctx.barbershopId) continue;
    if (comanda.status === "open") {
      if (comanda.appointment && comanda.appointment.at.getTime() > input.at.getTime()) continue;
      if (comanda.items.length > 0) {
        entries.push({
          comanda,
          kind: "unpaid",
          total: comandaTotal(comanda),
          options: comanda.appointment ? ["no_show", "keep_pending"] : ["keep_pending"],
          expiresInDays: pendingDaysLeft(comanda, input.at, input.expiryDays),
        });
      } else {
        entries.push({ comanda, kind: "empty", total: 0, options: comanda.appointment ? ["no_show"] : ["discard"], expiresInDays: null });
      }
    } else if (
      comanda.status === "no_show" &&
      comanda.items.length > 0 &&
      comanda.noShow &&
      comanda.noShow.at.getTime() >= open.value.openedAt.getTime()
    ) {
      entries.push({ comanda, kind: "no_show_with_items", total: comandaTotal(comanda), options: ["reviewed"], expiresInDays: null });
    }
  }
  entries.sort((a, b) => a.comanda.number - b.comanda.number);
  const atRiskTotal = entries.filter((e) => e.kind !== "empty").reduce((sum, e) => sum + e.total, 0);
  return ok({ entries, atRiskTotal });
}

export type DayCloseResult = {
  register: CashRegister;
  discarded: Comanda[];
  noShows: Comanda[];
  pending: Comanda[];
  reviewed: Comanda[];
  audits: AuditEntry[];
};

/**
 * R-CSH-05 / R-CSH-06 / R-CMD-18: close the register and settle the open comandas.
 * - owner only; open comandas NEVER block the closing;
 * - every entry of the plan needs a valid decision (the owner has seen them all);
 * - `confirmed` must be true: the screen asks "are you sure?" first;
 * - all or nothing: if anything is wrong, nothing is changed.
 */
export function closeDay(
  ctx: TenantContext,
  input: {
    register: CashRegister | null;
    movements: readonly CashMovement[];
    comandas: readonly Comanda[];
    countedCash: Cents;
    leftInDrawer?: Cents;
    reason: string | null;
    decisions: Readonly<Record<string, DayDecision>>;
    confirmed: boolean;
    expiryDays: number;
    at: Date;
  },
): Result<DayCloseResult> {
  const planned = planDayClose(ctx, input);
  if (!planned.ok) return planned;
  const { entries } = planned.value;

  const ids = new Set(entries.map((e) => e.comanda.id));
  if (Object.keys(input.decisions).some((id) => !ids.has(id))) {
    return fail("INVALID_INPUT", "Há uma decisão para uma comanda que não faz parte deste fechamento.");
  }
  for (const entry of entries) {
    const decision = input.decisions[entry.comanda.id];
    if (!decision) return fail("NEEDS_CONFIRMATION", `Decida o que fazer com a comanda #${entry.comanda.number} antes de fechar o caixa.`);
    if (!entry.options.includes(decision)) return fail("INVALID_INPUT", `Opção inválida para a comanda #${entry.comanda.number}.`);
  }
  if (!input.confirmed) return fail("NEEDS_CONFIRMATION", "Confirme o fechamento do caixa.");

  const pendingEntries = entries.filter((e) => input.decisions[e.comanda.id] === "keep_pending");
  const closed = closeRegister(ctx, input.register, input.movements, {
    countedCash: input.countedCash,
    leftInDrawer: input.leftInDrawer,
    reason: input.reason,
    pending: { count: pendingEntries.length, total: pendingEntries.reduce((sum, e) => sum + e.total, 0) },
    at: input.at,
  });
  if (!closed.ok) return closed;

  const result: DayCloseResult = { register: closed.value.register, discarded: [], noShows: [], pending: [], reviewed: [], audits: [...closed.value.audits] };
  for (const { comanda } of entries) {
    switch (input.decisions[comanda.id]) {
      case "discard": {
        const discarded = discardComanda(ctx, comanda, input.at);
        if (!discarded.ok) return discarded;
        result.discarded.push(discarded.value);
        break;
      }
      case "no_show": {
        const noShow = markNoShow(ctx, comanda, input.at);
        if (!noShow.ok) return noShow;
        result.noShows.push(noShow.value.comanda);
        result.audits.push(noShow.value.audit);
        break;
      }
      case "keep_pending":
        result.pending.push({ ...comanda, pendingSince: comanda.pendingSince ?? input.at });
        break;
      case "reviewed":
        result.reviewed.push(comanda);
        break;
    }
  }
  return ok(result);
}

/**
 * R-CMD-22: a pending comanda that was not paid within `expiryDays` is
 * cancelled by the SYSTEM (run once a day by a scheduled job, step 5). The
 * owner is alerted about every pending comanda at each closing, with the days
 * left, so this should never be a surprise. Each expiry is audited.
 */
export function expirePendingComandas(
  comandas: readonly Comanda[],
  now: Date,
  expiryDays: number,
): { comandas: Comanda[]; audits: AuditEntry[] } {
  const expired: Comanda[] = [];
  const audits: AuditEntry[] = [];
  for (const comanda of comandas) {
    if (comanda.status !== "open" || !comanda.pendingSince) continue;
    if (now.getTime() - comanda.pendingSince.getTime() < expiryDays * DAY_MS) continue;
    const reason = `Expirou: ${expiryDays} dias pendente sem pagamento`;
    expired.push({ ...comanda, status: "cancelled", pendingSince: null, cancellation: { reason, by: "system", at: now } });
    audits.push({
      barbershopId: comanda.barbershopId,
      action: "comanda.expired",
      userId: "system",
      at: now,
      entityId: comanda.id,
      details: { number: comanda.number, total: comandaTotal(comanda), pendingSince: comanda.pendingSince.toISOString(), reason },
    });
  }
  return { comandas: expired, audits };
}
