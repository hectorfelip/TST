"use server";
/**
 * The buttons of the comanda screens. Each action:
 *  1. reads the form (untrusted text),
 *  2. calls `act` (session + permission + ONE all-or-nothing transaction + idempotency),
 *  3. inside, only calls the commands of step 4 (which call the rules of step 3).
 * The browser never sends a barbershop, a role, a price or a total: only ids and what the person typed.
 */
import { redirect } from "next/navigation";
import { getSettings } from "@/modules/barbershops/data/settings.repo";
import { PAYMENT_METHODS, type PaymentMethod } from "@/modules/finance/rules/cash-register";
import { act, type ActionResult } from "@/server/run";
import { money, text } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { fail, ok } from "@/shared/result";
import { atLocalTime } from "@/shared/time";
import {
  addItemCmd,
  applyDiscountCmd,
  cancelComandaCmd,
  changePaymentMethodCmd,
  closeComandaCmd,
  closeDayCmd,
  discardComandaCmd,
  markNoShowCmd,
  openComandaCmd,
  removeItemCmd,
  setNoteCmd,
} from "../data/commands";
import type { DayDecision } from "../rules/day-close";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });
const DECISIONS: readonly DayDecision[] = ["no_show", "keep_pending", "discard", "reviewed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function method(raw: string) {
  return (PAYMENT_METHODS as readonly string[]).includes(raw) ? ok(raw as PaymentMethod) : fail("INVALID_INPUT", "Escolha a forma de pagamento.");
}

/** Opens a comanda for a registered client or a walk-in ("cliente avulso") and goes to it. */
export async function openComandaAction(_previous: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const clientId = text(formData, "clientId") || null;
  const result = await act({ permission: "comanda.open", idempotency: idem(formData, "comanda.open") }, async (tx, ctx) => {
    const opened = await openComandaCmd(tx, ctx, { clientId });
    return opened.ok ? ok({ id: opened.value.id }) : opened;
  });
  if (result.ok) {
    refreshScreens();
    redirect(`/comandas/${result.value.id}`);
  }
  return result;
}

/** Books a registered client with a barber, today or tomorrow. The times are read in the BARBERSHOP's time zone. */
export async function scheduleAction(_previous: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const day = text(formData, "day");
  const result = await act({ permission: "comanda.open", idempotency: idem(formData, "comanda.schedule") }, async (tx, ctx) => {
    if (day !== "hoje" && day !== "amanha") return fail("INVALID_INPUT", "Escolha o dia.");
    const clientId = text(formData, "clientId");
    if (!clientId) return fail("INVALID_INPUT", "Escolha o cliente.");
    const now = new Date();
    const { timeZone } = await getSettings(tx);
    const when = atLocalTime(now, timeZone, day === "hoje" ? 0 : 1, text(formData, "time"));
    if (!when) return fail("INVALID_INPUT", "Informe o horário, ex.: 15:30.");
    const barberId = text(formData, "barberId") || ctx.userId;
    const opened = await openComandaCmd(tx, ctx, { clientId, appointment: { at: when, barberId }, at: now });
    return opened.ok ? ok({ id: opened.value.id }) : opened;
  });
  if (result.ok) refreshScreens();
  return result;
}

/**
 * The button that was pressed says what to add: `item` = "service:<id>" or "product:<id>".
 * `confirmedItem` is the answer "yes, I have it in my hands" to the stock question (rule R-STK-04).
 */
export async function addItemAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const confirmedItem = text(formData, "confirmedItem");
  const [kind, refId] = (confirmedItem || text(formData, "item")).split(":");
  const result = await act({ idempotency: idem(formData, "comanda.add_item") }, async (tx, ctx) => {
    if (kind !== "service" && kind !== "product") return fail("INVALID_INPUT", "Item inválido.");
    const added = await addItemCmd(tx, ctx, text(formData, "comandaId"), {
      kind,
      refId,
      quantity: 1,
      barberId: text(formData, "barberId") || ctx.userId,
      confirmInHand: confirmedItem !== "",
    });
    return added.ok ? ok(null) : added;
  });
  if (result.ok) refreshScreens();
  return result;
}

export async function removeItemAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: idem(formData, "comanda.remove_item") }, async (tx, ctx) => {
    const removed = await removeItemCmd(tx, ctx, text(formData, "comandaId"), text(formData, "itemId"));
    return removed.ok ? ok(null) : removed;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** Empty comanda, no money involved: no reason needed. */
export async function discardComandaAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: idem(formData, "comanda.discard") }, async (tx, ctx) => {
    const discarded = await discardComandaCmd(tx, ctx, text(formData, "comandaId"));
    return discarded.ok ? ok(null) : discarded;
  });
  if (result.ok) {
    refreshScreens();
    redirect("/comandas");
  }
  return result;
}

/** "Client did not come". NOT a cancellation: the absence is recorded and the owner checks it when closing. */
export async function noShowAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: idem(formData, "comanda.no_show") }, async (tx, ctx) => {
    const marked = await markNoShowCmd(tx, ctx, text(formData, "comandaId"));
    return marked.ok ? ok(null) : marked;
  });
  if (result.ok) {
    refreshScreens();
    redirect("/agenda");
  }
  return result;
}

/** Only the owner cancels, with a reason that is saved with his name. */
export async function cancelComandaAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "comanda.cancel_open", idempotency: idem(formData, "comanda.cancel") }, async (tx, ctx) => {
    const comandaId = text(formData, "comandaId");
    const cancelled = await cancelComandaCmd(tx, ctx, comandaId, { reason: text(formData, "reason") });
    return cancelled.ok ? ok(null) : cancelled;
  });
  if (result.ok) {
    refreshScreens();
    redirect("/comandas");
  }
  return result;
}

/**
 * Receives the payment. Note, discount and payment are saved together or not at all
 * (a refused payment leaves no discount behind). Idempotent: a double tap charges once.
 */
export async function payComandaAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: idem(formData, "comanda.pay") }, async (tx, ctx) => {
    const comandaId = text(formData, "comandaId");
    const chosen = method(text(formData, "method"));
    if (!chosen.ok) return chosen;
    const received = money(formData, "received", "Dinheiro recebido");
    if (!received.ok) return received;
    const discount = money(formData, "discount", "Desconto", 0);
    if (!discount.ok) return discount;

    const note = text(formData, "note").trim();
    if (note) {
      const saved = await setNoteCmd(tx, ctx, comandaId, note);
      if (!saved.ok) return saved;
    }
    if ((discount.value ?? 0) > 0) {
      const applied = await applyDiscountCmd(tx, ctx, comandaId, discount.value ?? 0);
      if (!applied.ok) return applied;
    }
    const paid = await closeComandaCmd(tx, ctx, comandaId, { method: chosen.value, receivedCash: chosen.value === "cash" ? received.value : null });
    return paid.ok ? ok(null) : paid;
  });
  if (result.ok) {
    refreshScreens();
    redirect(`/comandas/${text(formData, "comandaId")}?paga=1`);
  }
  return result;
}

/** Owner: fix the payment method of a comanda while the register of that day is still open. */
export async function changePaymentMethodAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "comanda.change_payment_method", idempotency: idem(formData, "comanda.change_method") }, async (tx, ctx) => {
    const chosen = method(text(formData, "method"));
    if (!chosen.ok) return chosen;
    const changed = await changePaymentMethodCmd(tx, ctx, text(formData, "comandaId"), { method: chosen.value, reason: text(formData, "reason") });
    return changed.ok ? ok(null) : changed;
  });
  if (result.ok) refreshScreens();
  return result;
}

export type CloseCashSummary = { counted: number; expected: number; difference: number; left: number; discarded: number; noShows: number; pending: number; reviewed: number };

/**
 * Closes the register and settles every open comanda, in one go. `decisions` is what the owner chose for
 * each comanda; the rules refuse the closing unless he decided about ALL of them and confirmed.
 */
export async function closeCashAction(_previous: unknown, formData: FormData): Promise<ActionResult<CloseCashSummary>> {
  const result = await act({ permission: "cash.close", idempotency: idem(formData, "cash.close") }, async (tx, ctx) => {
    const counted = money(formData, "counted", "Dinheiro contado");
    if (!counted.ok) return counted;
    if (counted.value === null) return fail("INVALID_INPUT", "Informe o dinheiro contado.");
    const left = money(formData, "left", "Troco que fica");
    if (!left.ok) return left;

    let raw: unknown;
    try {
      raw = JSON.parse(text(formData, "decisions") || "{}");
    } catch {
      return fail("INVALID_INPUT", "Decisões inválidas. Recarregue a página.");
    }
    const decisions: Record<string, DayDecision> = {};
    for (const [id, decision] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      if (!UUID.test(id) || typeof decision !== "string" || !(DECISIONS as readonly string[]).includes(decision)) {
        return fail("INVALID_INPUT", "Decisões inválidas. Recarregue a página.");
      }
      decisions[id] = decision as DayDecision;
    }

    const closed = await closeDayCmd(tx, ctx, {
      countedCash: counted.value,
      leftInDrawer: left.value ?? undefined,
      reason: text(formData, "reason") || null,
      decisions,
      confirmed: text(formData, "confirmed") === "yes",
    });
    if (!closed.ok) return closed;
    const r = closed.value;
    return ok<CloseCashSummary>({
      counted: r.register.countedCash ?? 0,
      expected: (r.register.countedCash ?? 0) - (r.register.difference ?? 0),
      difference: r.register.difference ?? 0,
      left: r.register.leftInDrawer ?? 0,
      discarded: r.discarded.length,
      noShows: r.noShows.length,
      pending: r.pending.length,
      reviewed: r.reviewed.length,
    });
  });
  // No refresh here on purpose: the screen shows the "Caixa fechado" summary from this answer, and a refresh would replace
  // it with "no open register". Other screens are never cached for long, so they show the new state when opened.
  return result;
}
