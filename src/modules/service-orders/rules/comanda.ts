/**
 * Comanda (service order) — the center of the system.
 *
 * State machine:
 *
 *   open ──close (payment)──────────────► closed ──cancel (owner)──► cancelled
 *    │ ├─no-show (appointment, after its time) ─► no_show   NOT a cancellation
 *    │ ├─cancel (OWNER only, with a reason)────► cancelled
 *    │ ├─discard (no items)───────────────────► discarded
 *    │ └─pending for N days (system)──────────► cancelled   (see day-close.ts)
 *
 * Closing is the ONE action that updates money (cash movements), stock
 * (stock movements) and barber revenue. The rules only RETURN these effects;
 * the data layer (step 4) saves everything in one transaction.
 *
 * A comanda can also be an APPOINTMENT: opened in advance for a registered
 * client, with a time and a barber. This is the "light agenda" the barbers
 * need to see who is coming today and tomorrow.
 */
import { can, requirePermission } from "@/modules/auth/rules/permissions";
import {
  movement,
  PAYMENT_METHODS,
  requireOpenRegister,
  type CashMovement,
  type CashRegister,
  type PaymentMethod,
} from "@/modules/finance/rules/cash-register";
import { saleMovement, type Product, type StockMovement } from "@/modules/inventory/rules/stock";
import type { Service } from "@/modules/services/rules/catalog";
import type { AuditEntry } from "@/shared/audit";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import { assertSameTenant, type TenantContext } from "@/shared/tenant";
import { isValidReason } from "@/shared/text";
import { DAY_MS } from "@/shared/time";
import { subtotal } from "./totals";

export type ComandaStatus = "open" | "closed" | "cancelled" | "discarded" | "no_show";

export type ComandaItem = {
  id: string;
  kind: "service" | "product";
  /** Service or product id. */
  refId: string;
  /** Snapshot of the name and price at the moment the item was added (R-CMD-05). */
  name: string;
  unitPrice: Cents;
  quantity: number;
  /** Who did the service / sold the product. Revenue goes to this person. */
  barberId: string;
  addedBy: string;
  addedAt: Date;
  /** Set when the stock count was too low and the person confirmed having the product in hand (R-STK-04). */
  soldWithoutStock: { confirmedBy: string; at: Date } | null;
};

/** Removed items are kept, never lost: removing an item must not erase the trail. */
export type RemovedItem = { item: ComandaItem; by: string; at: Date };

export type Appointment = { at: Date; barberId: string };

export type Comanda = {
  id: string;
  barbershopId: string;
  /** Sequential per barbershop, given by the data layer. */
  number: number;
  /** null = walk-in client ("cliente avulso"). */
  clientId: string | null;
  openedBy: string;
  openedAt: Date;
  status: ComandaStatus;
  items: ComandaItem[];
  removedItems: RemovedItem[];
  discount: { amount: Cents; givenBy: string; at: Date } | null;
  payment: {
    method: PaymentMethod;
    total: Cents;
    receivedCash: Cents | null;
    change: Cents | null;
    registerId: string;
  } | null;
  note: string | null;
  /** Set when this comanda is an appointment (needs a registered client). */
  appointment: Appointment | null;
  /** When the owner chose "keep pending" at closing. Starts the expiry countdown. */
  pendingSince: Date | null;
  /** The client did not show up. Recorded for the owner; it is NOT a cancellation. */
  noShow: { by: string; at: Date } | null;
  closedAt: Date | null;
  closedBy: string | null;
  /** `by` is "system" when it expired by itself. */
  cancellation: { reason: string; by: string; at: Date } | null;
};

/** Minimal shapes the comanda needs from other modules. */
export type ClientRef = { id: string; barbershopId: string; anonymizedAt: Date | null };
export type BarberRef = { id: string; barbershopId: string; active: boolean };

export const MAX_ITEM_QUANTITY = 20;
export const MAX_NOTE_LENGTH = 280;
export const MAX_APPOINTMENT_DAYS = 14;

export function comandaSubtotal(comanda: Pick<Comanda, "items">): Cents {
  return subtotal(comanda.items);
}

export function comandaTotal(comanda: Pick<Comanda, "items" | "discount">): Cents {
  return comandaSubtotal(comanda) - (comanda.discount?.amount ?? 0);
}

/**
 * R-CMD-02: "own comanda" = opened by the user, or with at least one item
 * done by him, or an appointment booked with him.
 */
export function isComandaOf(comanda: Pick<Comanda, "openedBy" | "items" | "appointment">, userId: string): boolean {
  return (
    comanda.openedBy === userId ||
    comanda.appointment?.barberId === userId ||
    comanda.items.some((item) => item.barberId === userId)
  );
}

/** R-CMD-03: who can see a comanda. */
export function canView(ctx: TenantContext, comanda: Comanda): boolean {
  if (comanda.barbershopId !== ctx.barbershopId) return false;
  return can(ctx.role, "comanda.view_any") || isComandaOf(comanda, ctx.userId);
}

function requireEditable(ctx: TenantContext, comanda: Comanda): Result<Comanda> {
  const tenant = assertSameTenant(ctx, comanda);
  if (!tenant.ok) return tenant;
  const allowed = can(ctx.role, "comanda.edit_any") || (can(ctx.role, "comanda.edit_own") && isComandaOf(comanda, ctx.userId));
  if (!allowed) return fail("FORBIDDEN", "Esta comanda não é sua.");
  if (comanda.status !== "open") return fail("INVALID_STATE", "Esta comanda não está aberta.");
  return ok(comanda);
}

function audit(ctx: TenantContext, action: AuditEntry["action"], comanda: Comanda, at: Date, details: AuditEntry["details"]): AuditEntry {
  return { barbershopId: ctx.barbershopId, action, userId: ctx.userId, at, entityId: comanda.id, details: { number: comanda.number, ...details } };
}

/**
 * R-CMD-01: anyone logged in can open a comanda. The client is optional.
 * R-CMD-20: an APPOINTMENT needs a registered client, a time that has not
 * passed and is at most 14 days ahead, and an active barber. A barber can
 * only book in his own name; the owner can book for any barber.
 */
export function openComanda(
  ctx: TenantContext,
  input: {
    id: string;
    number: number;
    client: ClientRef | null;
    at: Date;
    appointment?: { at: Date; barber: BarberRef } | null;
  },
): Result<Comanda> {
  const allowed = requirePermission(ctx, "comanda.open");
  if (!allowed.ok) return allowed;
  if (input.client) {
    const tenant = assertSameTenant(ctx, input.client);
    if (!tenant.ok) return tenant;
    if (input.client.anonymizedAt) return fail("INVALID_INPUT", "Este cliente foi removido.");
  }
  if (!Number.isInteger(input.number) || input.number <= 0) return fail("INVALID_INPUT", "Número de comanda inválido.");

  let appointment: Appointment | null = null;
  if (input.appointment) {
    const { at, barber } = input.appointment;
    if (!input.client) return fail("INVALID_INPUT", "Agendamento precisa de um cliente cadastrado.");
    if (at.getTime() < input.at.getTime()) return fail("INVALID_INPUT", "O horário do agendamento já passou.");
    if (at.getTime() - input.at.getTime() > MAX_APPOINTMENT_DAYS * DAY_MS) {
      return fail("INVALID_INPUT", `Só é possível agendar até ${MAX_APPOINTMENT_DAYS} dias à frente.`);
    }
    const tenant = assertSameTenant(ctx, barber);
    if (!tenant.ok) return tenant;
    if (!barber.active) return fail("INVALID_INPUT", "Este barbeiro está inativo.");
    if (barber.id !== ctx.userId && !can(ctx.role, "comanda.assign_other_barber")) {
      return fail("FORBIDDEN", "Você só pode agendar no seu nome.");
    }
    appointment = { at, barberId: barber.id };
  }

  return ok({
    id: input.id,
    barbershopId: ctx.barbershopId,
    number: input.number,
    clientId: input.client?.id ?? null,
    openedBy: ctx.userId,
    openedAt: input.at,
    status: "open",
    items: [],
    removedItems: [],
    discount: null,
    payment: null,
    note: null,
    appointment,
    pendingSince: null,
    noShow: null,
    closedAt: null,
    closedBy: null,
    cancellation: null,
  });
}

type ItemSource = { kind: "service"; service: Service } | { kind: "product"; product: Product };

/**
 * R-CMD-04: add a service or product to an open comanda.
 * R-CMD-05: the price is copied from the catalog now; later price changes do not affect it.
 * R-CMD-06: a barber can only put items in his own name; the owner can choose any active barber.
 * R-CMD-07: only active services and active products for sale can be added.
 * R-CMD-17: changing the items removes the discount.
 * R-STK-04 (revised after owner feedback): if the system stock is lower than
 * the quantity, the person must CONFIRM that he has the product in hand to
 * deliver now (`confirmInHand`). Without it the item is not added. The
 * confirmation is saved on the item and audited when the comanda is closed.
 */
export function addItem(
  ctx: TenantContext,
  comanda: Comanda,
  input: { itemId: string; source: ItemSource; quantity: number; barber: BarberRef; confirmInHand?: boolean; at: Date },
): Result<Comanda> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_ITEM_QUANTITY) {
    return fail("INVALID_INPUT", `Quantidade deve ser de 1 a ${MAX_ITEM_QUANTITY}.`);
  }

  const barberTenant = assertSameTenant(ctx, input.barber);
  if (!barberTenant.ok) return barberTenant;
  if (!input.barber.active) return fail("INVALID_INPUT", "Este barbeiro está inativo.");
  if (input.barber.id !== ctx.userId && !can(ctx.role, "comanda.assign_other_barber")) {
    return fail("FORBIDDEN", "Você só pode lançar itens no seu nome.");
  }

  let line: Pick<ComandaItem, "kind" | "refId" | "name" | "unitPrice" | "soldWithoutStock">;
  if (input.source.kind === "service") {
    const service = input.source.service;
    const tenant = assertSameTenant(ctx, service);
    if (!tenant.ok) return tenant;
    if (!service.active) return fail("INVALID_INPUT", "Este serviço está inativo.");
    line = { kind: "service", refId: service.id, name: service.name, unitPrice: service.price, soldWithoutStock: null };
  } else {
    const product = input.source.product;
    const tenant = assertSameTenant(ctx, product);
    if (!tenant.ok) return tenant;
    if (!product.active) return fail("INVALID_INPUT", "Este produto está inativo.");
    if (product.use !== "sale" || product.salePrice === null) return fail("INVALID_INPUT", "Este produto é de uso interno e não pode ser vendido.");

    const alreadyHere = comanda.items
      .filter((i) => i.kind === "product" && i.refId === product.id)
      .reduce((sum, i) => sum + i.quantity, 0);
    const available = Math.max(product.stock - alreadyHere, 0);
    let soldWithoutStock: ComandaItem["soldWithoutStock"] = null;
    if (input.quantity > available) {
      if (!input.confirmInHand) {
        return fail("NEEDS_CONFIRMATION", `Estoque no sistema: ${available}. Você tem o produto em mãos para entregar agora?`);
      }
      soldWithoutStock = { confirmedBy: ctx.userId, at: input.at };
    }
    line = { kind: "product", refId: product.id, name: product.name, unitPrice: product.salePrice, soldWithoutStock };
  }

  const newItem: ComandaItem = {
    ...line,
    id: input.itemId,
    quantity: input.quantity,
    barberId: input.barber.id,
    addedBy: ctx.userId,
    addedAt: input.at,
  };
  return ok({ ...comanda, items: [...comanda.items, newItem], discount: null });
}

/**
 * R-CMD-08: remove an item from an open comanda. A barber can only remove
 * items in his own name. R-CMD-17 applies (the discount is removed).
 * R-CMD-21: the removed item is KEPT in `removedItems` (who and when). Without
 * a trail, a barber could add an item, take the client's cash, remove the
 * item and discard the empty comanda.
 */
export function removeItem(ctx: TenantContext, comanda: Comanda, itemId: string, at: Date): Result<Comanda> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  const item = comanda.items.find((i) => i.id === itemId);
  if (!item) return fail("INVALID_INPUT", "Item não encontrado nesta comanda.");
  if (item.barberId !== ctx.userId && !can(ctx.role, "comanda.edit_any")) {
    return fail("FORBIDDEN", "Você só pode remover itens no seu nome.");
  }
  return ok({
    ...comanda,
    items: comanda.items.filter((i) => i.id !== itemId),
    removedItems: [...comanda.removedItems, { item, by: ctx.userId, at }],
    discount: null,
  });
}

/** R-CMD-09: a free-text note (e.g. how a split payment was made, until v2). */
export function setNote(ctx: TenantContext, comanda: Comanda, note: string): Result<Comanda> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  const trimmed = note.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) return fail("INVALID_INPUT", `Observação deve ter no máximo ${MAX_NOTE_LENGTH} caracteres.`);
  return ok({ ...comanda, note: trimmed === "" ? null : trimmed });
}

/**
 * R-CMD-10: only the owner gives discounts. A discount is a whole amount in
 * cents, between 0 and the subtotal. 0 removes it. Every discount is audited
 * (who gave it and how much).
 */
export function applyDiscount(
  ctx: TenantContext,
  comanda: Comanda,
  amount: Cents,
  at: Date,
): Result<{ comanda: Comanda; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "comanda.discount");
  if (!allowed.ok) return allowed;
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  if (!Number.isInteger(amount) || amount < 0) return fail("INVALID_INPUT", "Desconto inválido.");
  if (amount > comandaSubtotal(comanda)) return fail("INVALID_INPUT", "Desconto maior que o total da comanda.");
  const discount = amount === 0 ? null : { amount, givenBy: ctx.userId, at };
  return ok({
    comanda: { ...comanda, discount },
    audit: audit(ctx, "comanda.discount", comanda, at, { amount, subtotal: comandaSubtotal(comanda) }),
  });
}

export type CloseResult = {
  comanda: Comanda;
  cashMovements: CashMovement[];
  stockMovements: StockMovement[];
  audits: AuditEntry[];
};

/**
 * R-CMD-11: close (receive payment).
 * - comanda must be open, editable by the user and have at least one item;
 * - the cash register must be open (the money belongs to a register);
 * - one payment method per comanda (split payment is v2 — use the note);
 * - for cash, the received amount is optional; if given it must cover the
 *   total and the change is calculated; for other methods it must be empty;
 * - effects: one sale cash movement (if total > 0), one stock movement per
 *   product line, and one audit entry per item sold without stock.
 */
export function closeComanda(
  ctx: TenantContext,
  comanda: Comanda,
  input: { method: PaymentMethod; receivedCash: Cents | null; at: Date },
  register: CashRegister | null,
): Result<CloseResult> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  if (comanda.items.length === 0) return fail("INVALID_STATE", "Adicione pelo menos um item antes de fechar.");
  const open = requireOpenRegister(ctx, register);
  if (!open.ok) return open;
  if (!PAYMENT_METHODS.includes(input.method)) return fail("INVALID_INPUT", "Forma de pagamento inválida.");

  const total = comandaTotal(comanda);
  let change: Cents | null = null;
  if (input.receivedCash !== null) {
    if (input.method !== "cash") return fail("INVALID_INPUT", "Valor recebido só se aplica a pagamento em dinheiro.");
    if (!Number.isInteger(input.receivedCash) || input.receivedCash < total) {
      return fail("INVALID_INPUT", "Valor recebido é menor que o total.");
    }
    change = input.receivedCash - total;
  }

  const closed: Comanda = {
    ...comanda,
    status: "closed",
    payment: { method: input.method, total, receivedCash: input.receivedCash, change, registerId: open.value.id },
    pendingSince: null,
    closedAt: input.at,
    closedBy: ctx.userId,
  };
  const cashMovements =
    total > 0
      ? [movement(open.value, ctx.userId, "sale", input.method, total, `Comanda #${comanda.number}`, comanda.id, input.at)]
      : [];
  const stockMovements = comanda.items
    .filter((item) => item.kind === "product")
    .map((item) => saleMovement(ctx.barbershopId, item.refId, item.quantity, comanda.id, ctx.userId, input.at));
  const audits: AuditEntry[] = comanda.items
    .filter((item) => item.soldWithoutStock)
    .map((item) => ({
      barbershopId: ctx.barbershopId,
      action: "comanda.sold_without_stock" as const,
      userId: item.soldWithoutStock?.confirmedBy ?? ctx.userId,
      at: input.at,
      entityId: comanda.id,
      details: { number: comanda.number, product: item.name, quantity: item.quantity },
    }));
  return ok({ comanda: closed, cashMovements, stockMovements, audits });
}

/** R-CMD-14: an open comanda with no items can be discarded without a reason. */
export function discardComanda(ctx: TenantContext, comanda: Comanda, at: Date): Result<Comanda> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  if (comanda.items.length > 0) return fail("NOT_ALLOWED", "A comanda tem itens. Peça ao dono para cancelar e informar o motivo.");
  return ok({ ...comanda, status: "discarded", closedAt: at, closedBy: ctx.userId });
}

/**
 * R-CMD-19: the client booked and did not show up. This is NOT a cancellation:
 * the comanda is paused (it leaves the day's agenda), the absence is recorded
 * on the comanda and in the audit log, and the owner reviews it when closing
 * the register.
 * - only comandas that are appointments;
 * - only AFTER the appointment time (cannot be used to hide a client who is
 *   still coming);
 * - the barber of that comanda, or the owner;
 * - no stock or money is touched.
 */
export function markNoShow(ctx: TenantContext, comanda: Comanda, at: Date): Result<{ comanda: Comanda; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "comanda.mark_no_show");
  if (!allowed.ok) return allowed;
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  if (!comanda.appointment) return fail("INVALID_STATE", "Só comandas agendadas podem ser marcadas como 'não compareceu'.");
  if (at.getTime() < comanda.appointment.at.getTime()) {
    return fail("NOT_ALLOWED", "Só é possível marcar 'não compareceu' depois do horário agendado.");
  }
  return ok({
    comanda: { ...comanda, status: "no_show", pendingSince: null, noShow: { by: ctx.userId, at } },
    audit: audit(ctx, "comanda.no_show", comanda, at, {
      appointmentAt: comanda.appointment.at.toISOString(),
      itemCount: comanda.items.length,
      total: comandaTotal(comanda),
    }),
  });
}

/**
 * R-CMD-15: cancel.
 * - OPEN comanda: OWNER only, with a reason (R-CMD-19: a barber who has a
 *   client that did not come uses "no-show"; a barber who made a mistake
 *   removes his item and discards the empty comanda);
 * - PAID comanda: owner only, the register must be open, and reversal
 *   movements return the money and the products to the CURRENT register
 *   (history is never deleted);
 * - every cancellation needs a reason (≥ 5 characters) and is audited.
 */
export function cancelComanda(
  ctx: TenantContext,
  comanda: Comanda,
  input: { reason: string; at: Date },
  register: CashRegister | null,
): Result<Omit<CloseResult, "audits"> & { audit: AuditEntry }> {
  const tenant = assertSameTenant(ctx, comanda);
  if (!tenant.ok) return tenant;
  if (!isValidReason(input.reason)) return fail("INVALID_INPUT", "Informe o motivo do cancelamento (mínimo 5 caracteres).");
  const cancellation = { reason: input.reason.trim(), by: ctx.userId, at: input.at };
  const auditEntry = audit(ctx, "comanda.cancel", comanda, input.at, { previousStatus: comanda.status, total: comandaTotal(comanda), reason: cancellation.reason });

  if (comanda.status === "open") {
    const allowed = requirePermission(ctx, "comanda.cancel_open");
    if (!allowed.ok) return fail("FORBIDDEN", "Só o dono cancela. Cliente não veio? Use 'Não compareceu'.");
    if (comanda.items.length === 0) return fail("NOT_ALLOWED", "Comanda vazia: use descartar.");
    return ok({ comanda: { ...comanda, status: "cancelled", pendingSince: null, cancellation }, cashMovements: [], stockMovements: [], audit: auditEntry });
  }

  if (comanda.status !== "closed" || !comanda.payment) return fail("INVALID_STATE", "Esta comanda já foi cancelada, descartada ou marcada como não compareceu.");
  const allowed = requirePermission(ctx, "comanda.cancel_closed");
  if (!allowed.ok) return fail("FORBIDDEN", "Só o dono pode cancelar uma comanda já paga.");
  const open = requireOpenRegister(ctx, register);
  if (!open.ok) return open;

  const { method, total } = comanda.payment;
  const cashMovements =
    total > 0
      ? [movement(open.value, ctx.userId, "sale_reversal", method, -total, `Cancelamento da comanda #${comanda.number}`, comanda.id, input.at)]
      : [];
  const stockMovements = comanda.items
    .filter((item) => item.kind === "product")
    .map((item) => saleMovement(ctx.barbershopId, item.refId, item.quantity, comanda.id, ctx.userId, input.at, true));
  return ok({ comanda: { ...comanda, status: "cancelled", cancellation }, cashMovements, stockMovements, audit: auditEntry });
}

/**
 * R-CMD-16: the owner can correct the payment method of a closed comanda
 * (e.g. Pix recorded as cash) only while the register where it was paid is
 * still open. Two correction movements keep the history; the change is audited.
 *
 * Why only while that register is open: a closed register is a SEALED day.
 * Its counted cash and its difference were already explained. If a sale
 * could be re-labelled afterwards ("it was Pix, not cash"), a cash shortage
 * could disappear from the books days later.
 */
export function changePaymentMethod(
  ctx: TenantContext,
  comanda: Comanda,
  input: { method: PaymentMethod; reason: string; at: Date },
  register: CashRegister | null,
): Result<{ comanda: Comanda; cashMovements: CashMovement[]; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "comanda.change_payment_method");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, comanda);
  if (!tenant.ok) return tenant;
  if (comanda.status !== "closed" || !comanda.payment) return fail("INVALID_STATE", "Só é possível corrigir comandas fechadas.");
  if (!PAYMENT_METHODS.includes(input.method)) return fail("INVALID_INPUT", "Forma de pagamento inválida.");
  if (input.method === comanda.payment.method) return fail("INVALID_INPUT", "A forma de pagamento já é essa.");
  if (!isValidReason(input.reason)) return fail("INVALID_INPUT", "Informe o motivo da correção (mínimo 5 caracteres).");
  const open = requireOpenRegister(ctx, register);
  if (!open.ok) return open;
  if (open.value.id !== comanda.payment.registerId) {
    return fail("NOT_ALLOWED", "O caixa desta comanda já foi fechado. A correção não é mais possível.");
  }

  const { total, method: oldMethod } = comanda.payment;
  const description = `Correção da comanda #${comanda.number}`;
  const cashMovements =
    total > 0
      ? [
          movement(open.value, ctx.userId, "payment_correction", oldMethod, -total, description, comanda.id, input.at),
          movement(open.value, ctx.userId, "payment_correction", input.method, total, description, comanda.id, input.at),
        ]
      : [];
  const isCash = input.method === "cash";
  return ok({
    comanda: {
      ...comanda,
      payment: { ...comanda.payment, method: input.method, receivedCash: isCash ? comanda.payment.receivedCash : null, change: isCash ? comanda.payment.change : null },
    },
    cashMovements,
    audit: audit(ctx, "comanda.payment_method_changed", comanda, input.at, { from: oldMethod, to: input.method, reason: input.reason.trim() }),
  });
}
