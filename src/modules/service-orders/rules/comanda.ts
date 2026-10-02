/**
 * Comanda (service order) — the center of the system.
 *
 * State machine:
 *
 *   open ──close──► closed ──cancel (owner)──► cancelled
 *     │  └─cancel (with items)──────────────► cancelled
 *     └──discard (no items)──► discarded
 *
 * Closing is the ONE action that updates money (cash movements), stock
 * (stock movements) and barber revenue. The rules only RETURN these effects;
 * the data layer (step 4) saves everything in one transaction.
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
import { subtotal } from "./totals";

export type ComandaStatus = "open" | "closed" | "cancelled" | "discarded";

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
};

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
  discount: { amount: Cents; givenBy: string; at: Date } | null;
  payment: {
    method: PaymentMethod;
    total: Cents;
    receivedCash: Cents | null;
    change: Cents | null;
    registerId: string;
  } | null;
  note: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  cancellation: { reason: string; by: string; at: Date } | null;
};

/** Minimal shapes the comanda needs from other modules. */
export type ClientRef = { id: string; barbershopId: string; anonymizedAt: Date | null };
export type BarberRef = { id: string; barbershopId: string; active: boolean };

export const MAX_ITEM_QUANTITY = 20;
export const MAX_NOTE_LENGTH = 280;

export function comandaSubtotal(comanda: Pick<Comanda, "items">): Cents {
  return subtotal(comanda.items);
}

export function comandaTotal(comanda: Pick<Comanda, "items" | "discount">): Cents {
  return comandaSubtotal(comanda) - (comanda.discount?.amount ?? 0);
}

/** R-CMD-02: "own comanda" = opened by the user or with at least one item done by him. */
export function isComandaOf(comanda: Pick<Comanda, "openedBy" | "items">, userId: string): boolean {
  return comanda.openedBy === userId || comanda.items.some((item) => item.barberId === userId);
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

/** R-CMD-01: anyone logged in can open a comanda. The client is optional. */
export function openComanda(
  ctx: TenantContext,
  input: { id: string; number: number; client: ClientRef | null; at: Date },
): Result<Comanda> {
  const allowed = requirePermission(ctx, "comanda.open");
  if (!allowed.ok) return allowed;
  if (input.client) {
    const tenant = assertSameTenant(ctx, input.client);
    if (!tenant.ok) return tenant;
    if (input.client.anonymizedAt) return fail("INVALID_INPUT", "Este cliente foi removido.");
  }
  if (!Number.isInteger(input.number) || input.number <= 0) return fail("INVALID_INPUT", "Número de comanda inválido.");
  return ok({
    id: input.id,
    barbershopId: ctx.barbershopId,
    number: input.number,
    clientId: input.client?.id ?? null,
    openedBy: ctx.userId,
    openedAt: input.at,
    status: "open",
    items: [],
    discount: null,
    payment: null,
    note: null,
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
 * R-STK-04: the stock count never blocks a sale.
 * R-CMD-17: changing the items removes the discount (the owner must give it
 * again for the new items, so a discount is never carried to other items).
 */
export function addItem(
  ctx: TenantContext,
  comanda: Comanda,
  input: { itemId: string; source: ItemSource; quantity: number; barber: BarberRef; at: Date },
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

  let item: Omit<ComandaItem, "id" | "quantity" | "barberId" | "addedBy" | "addedAt">;
  if (input.source.kind === "service") {
    const service = input.source.service;
    const tenant = assertSameTenant(ctx, service);
    if (!tenant.ok) return tenant;
    if (!service.active) return fail("INVALID_INPUT", "Este serviço está inativo.");
    item = { kind: "service", refId: service.id, name: service.name, unitPrice: service.price };
  } else {
    const product = input.source.product;
    const tenant = assertSameTenant(ctx, product);
    if (!tenant.ok) return tenant;
    if (!product.active) return fail("INVALID_INPUT", "Este produto está inativo.");
    if (product.use !== "sale" || product.salePrice === null) return fail("INVALID_INPUT", "Este produto é de uso interno e não pode ser vendido.");
    item = { kind: "product", refId: product.id, name: product.name, unitPrice: product.salePrice };
  }

  const newItem: ComandaItem = {
    ...item,
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
 */
export function removeItem(ctx: TenantContext, comanda: Comanda, itemId: string): Result<Comanda> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  const item = comanda.items.find((i) => i.id === itemId);
  if (!item) return fail("INVALID_INPUT", "Item não encontrado nesta comanda.");
  if (item.barberId !== ctx.userId && !can(ctx.role, "comanda.edit_any")) {
    return fail("FORBIDDEN", "Você só pode remover itens no seu nome.");
  }
  return ok({ ...comanda, items: comanda.items.filter((i) => i.id !== itemId), discount: null });
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
};

/**
 * R-CMD-11: close (receive payment).
 * - comanda must be open, editable by the user and have at least one item;
 * - the cash register must be open (the money belongs to a register);
 * - one payment method per comanda (split payment is v2 — use the note);
 * - for cash, the received amount is optional; if given it must cover the
 *   total and the change is calculated; for other methods it must be empty;
 * - effects: one sale cash movement (if total > 0) and one stock movement per product line.
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
  return ok({ comanda: closed, cashMovements, stockMovements });
}

/** R-CMD-14: an open comanda with no items can be discarded without a reason. */
export function discardComanda(ctx: TenantContext, comanda: Comanda, at: Date): Result<Comanda> {
  const editable = requireEditable(ctx, comanda);
  if (!editable.ok) return editable;
  if (comanda.items.length > 0) return fail("NOT_ALLOWED", "A comanda tem itens. Use cancelar e informe o motivo.");
  return ok({ ...comanda, status: "discarded", closedAt: at, closedBy: ctx.userId });
}

/**
 * R-CMD-15: cancel.
 * - open comanda with items: the barber (own) or the owner, with a reason;
 * - closed comanda: owner only, with a reason, and the cash register must be
 *   open — the money and the products go back through reversal movements in
 *   the CURRENT register (history is never deleted);
 * - every cancellation is audited.
 */
export function cancelComanda(
  ctx: TenantContext,
  comanda: Comanda,
  input: { reason: string; at: Date },
  register: CashRegister | null,
): Result<CloseResult & { audit: AuditEntry }> {
  const tenant = assertSameTenant(ctx, comanda);
  if (!tenant.ok) return tenant;
  if (!isValidReason(input.reason)) return fail("INVALID_INPUT", "Informe o motivo do cancelamento (mínimo 5 caracteres).");
  const cancellation = { reason: input.reason.trim(), by: ctx.userId, at: input.at };
  const auditEntry = audit(ctx, "comanda.cancel", comanda, input.at, { previousStatus: comanda.status, total: comandaTotal(comanda), reason: cancellation.reason });

  if (comanda.status === "open") {
    const editable = requireEditable(ctx, comanda);
    if (!editable.ok) return editable;
    if (comanda.items.length === 0) return fail("NOT_ALLOWED", "Comanda vazia: use descartar.");
    return ok({ comanda: { ...comanda, status: "cancelled", cancellation }, cashMovements: [], stockMovements: [], audit: auditEntry });
  }

  if (comanda.status !== "closed" || !comanda.payment) return fail("INVALID_STATE", "Esta comanda já foi cancelada ou descartada.");
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
