/**
 * Comanda actions: the heart of the system.
 *
 * Every command does the same four things, inside the ONE transaction that
 * `withTenant` opened:
 *   1. LOCK the rows that must not change under our feet (comanda, register, products);
 *   2. LOAD what the rule needs;
 *   3. call the pure RULE from step 3 (if it refuses, nothing is written);
 *   4. SAVE every effect together: the comanda, the cash movements, the stock
 *      movements and the audit entries. All of it, or none of it.
 */
import { randomUUID } from "node:crypto";
import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { getSettings } from "@/modules/barbershops/data/settings.repo";
import { pendingExpiry } from "@/modules/barbershops/rules/settings";
import { getEmployee } from "@/modules/employees/data/employees.repo";
import {
  getOpenRegister,
  insertCashMovements,
  listCashMovements,
  saveClosedRegister,
} from "@/modules/finance/data/registers.repo";
import type { CashRegister, PaymentMethod } from "@/modules/finance/rules/cash-register";
import { getClient } from "@/modules/clients/data/clients.repo";
import { getProduct, insertStockMovements, lockProducts } from "@/modules/inventory/data/inventory.repo";
import { getService } from "@/modules/services/data/services.repo";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import {
  addItem,
  applyDiscount,
  cancelComanda,
  changePaymentMethod,
  closeComanda,
  discardComanda,
  markNoShow,
  openComanda,
  removeItem,
  setNote,
  type BarberRef,
  type ClientRef,
  type Comanda,
} from "../rules/comanda";
import { closeDay, planDayClose, type DayClosePlan, type DayCloseResult, type DayDecision } from "../rules/day-close";
import { getComanda, insertComanda, listForDayClose, nextComandaNumber, saveComanda } from "./comandas.repo";

const notFound = () => fail("WRONG_TENANT", "Registro não encontrado.");
const barberRef = (e: { id: string; barbershopId: string; active: boolean }): BarberRef => ({ id: e.id, barbershopId: e.barbershopId, active: e.active });

/** Locks the comanda and loads it. Anyone else acting on it waits until this transaction ends. */
async function lockedComanda(tx: Tx, id: string): Promise<Comanda | null> {
  return getComanda(tx, id, { lock: true });
}

export async function openComandaCmd(
  tx: Tx,
  ctx: TenantContext,
  input: { clientId?: string | null; appointment?: { at: Date; barberId: string } | null; at?: Date },
): Promise<Result<Comanda>> {
  const at = input.at ?? new Date();
  let client: ClientRef | null = null;
  if (input.clientId) {
    const found = await getClient(tx, input.clientId);
    if (!found) return fail("INVALID_INPUT", "Cliente não encontrado.");
    client = { id: found.id, barbershopId: found.barbershopId, anonymizedAt: found.anonymizedAt };
  }
  let appointment: { at: Date; barber: BarberRef } | null = null;
  if (input.appointment) {
    const barber = await getEmployee(tx, input.appointment.barberId);
    if (!barber) return fail("INVALID_INPUT", "Barbeiro não encontrado.");
    appointment = { at: input.appointment.at, barber: barberRef(barber) };
  }
  // The rule is run first with a provisional number: if it refuses, no number is used up (no gaps).
  const probe = openComanda(ctx, { id: randomUUID(), number: 1, client, at, appointment });
  if (!probe.ok) return probe;
  const comanda: Comanda = { ...probe.value, number: await nextComandaNumber(tx) };
  await insertComanda(tx, comanda);
  return ok(comanda);
}

export async function addItemCmd(
  tx: Tx,
  ctx: TenantContext,
  comandaId: string,
  input: { kind: "service" | "product"; refId: string; quantity: number; barberId: string; confirmInHand?: boolean; at?: Date },
): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const barber = await getEmployee(tx, input.barberId);
  if (!barber) return fail("INVALID_INPUT", "Barbeiro não encontrado.");
  let source: Parameters<typeof addItem>[2]["source"];
  if (input.kind === "service") {
    const service = await getService(tx, input.refId);
    if (!service) return notFound();
    source = { kind: "service", service };
  } else {
    const product = await getProduct(tx, input.refId); // its stock is the SUM of the movements
    if (!product) return notFound();
    source = { kind: "product", product };
  }
  const result = addItem(ctx, comanda, { itemId: randomUUID(), source, quantity: input.quantity, barber: barberRef(barber), confirmInHand: input.confirmInHand, at: input.at ?? new Date() });
  if (!result.ok) return result;
  await saveComanda(tx, result.value);
  return result;
}

export async function removeItemCmd(tx: Tx, ctx: TenantContext, comandaId: string, itemId: string, at = new Date()): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const result = removeItem(ctx, comanda, itemId, at);
  if (!result.ok) return result;
  await saveComanda(tx, result.value);
  return result;
}

export async function setNoteCmd(tx: Tx, ctx: TenantContext, comandaId: string, note: string): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const result = setNote(ctx, comanda, note);
  if (!result.ok) return result;
  await saveComanda(tx, result.value);
  return result;
}

export async function applyDiscountCmd(tx: Tx, ctx: TenantContext, comandaId: string, amount: Cents, at = new Date()): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const result = applyDiscount(ctx, comanda, amount, at);
  if (!result.ok) return result;
  await saveComanda(tx, result.value.comanda);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.comanda);
}

export async function discardComandaCmd(tx: Tx, ctx: TenantContext, comandaId: string, at = new Date()): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const result = discardComanda(ctx, comanda, at);
  if (!result.ok) return result;
  await saveComanda(tx, result.value);
  return result;
}

export async function markNoShowCmd(tx: Tx, ctx: TenantContext, comandaId: string, at = new Date()): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const result = markNoShow(ctx, comanda, at);
  if (!result.ok) return result;
  await saveComanda(tx, result.value.comanda);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.comanda);
}

/**
 * R-CMD-11: receive the payment. Locks the comanda (nobody can close it twice),
 * shares a lock on the register (the register cannot be closed while this runs)
 * and on the products (a stock adjustment cannot run in the middle).
 */
export async function closeComandaCmd(
  tx: Tx,
  ctx: TenantContext,
  comandaId: string,
  input: { method: PaymentMethod; receivedCash?: Cents | null; at?: Date },
): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const register = await getOpenRegister(tx, "share");
  await lockProducts(tx, comanda.items.filter((i) => i.kind === "product").map((i) => i.refId), "share");
  const result = closeComanda(ctx, comanda, { method: input.method, receivedCash: input.receivedCash ?? null, at: input.at ?? new Date() }, register);
  if (!result.ok) return result;
  await saveComanda(tx, result.value.comanda);
  await insertCashMovements(tx, result.value.cashMovements);
  await insertStockMovements(tx, result.value.stockMovements);
  await insertAudit(tx, result.value.audits);
  return ok(result.value.comanda);
}

/** R-CMD-15: cancel. A paid comanda returns the money and the products with reversal movements in the CURRENT register. */
export async function cancelComandaCmd(tx: Tx, ctx: TenantContext, comandaId: string, input: { reason: string; at?: Date }): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const register = await getOpenRegister(tx, "share");
  await lockProducts(tx, comanda.items.filter((i) => i.kind === "product").map((i) => i.refId), "share");
  const result = cancelComanda(ctx, comanda, { reason: input.reason, at: input.at ?? new Date() }, register);
  if (!result.ok) return result;
  await saveComanda(tx, result.value.comanda);
  await insertCashMovements(tx, result.value.cashMovements);
  await insertStockMovements(tx, result.value.stockMovements);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.comanda);
}

/** R-CMD-16: only while the register where it was paid is still open (a closed day is sealed). */
export async function changePaymentMethodCmd(
  tx: Tx,
  ctx: TenantContext,
  comandaId: string,
  input: { method: PaymentMethod; reason: string; at?: Date },
): Promise<Result<Comanda>> {
  const comanda = await lockedComanda(tx, comandaId);
  if (!comanda) return notFound();
  const register = await getOpenRegister(tx, "share");
  const result = changePaymentMethod(ctx, comanda, { method: input.method, reason: input.reason, at: input.at ?? new Date() }, register);
  if (!result.ok) return result;
  await saveComanda(tx, result.value.comanda);
  await insertCashMovements(tx, result.value.cashMovements);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.comanda);
}

/** What the "Fechar caixa" screen shows: every unpaid service, with the options for each. Read only. */
export async function planDayCloseCmd(tx: Tx, ctx: TenantContext, at = new Date()): Promise<Result<DayClosePlan>> {
  const register = await getOpenRegister(tx);
  const comandas = register ? await listForDayClose(tx, register.openedAt) : [];
  const settings = await getSettings(tx);
  return planDayClose(ctx, { register, comandas, expiryDays: pendingExpiry(settings), at });
}

/**
 * R-CSH-05/06/08: closes the register and settles every open comanda. The
 * register is locked (nobody can receive a payment meanwhile) and so is every
 * comanda involved (a barber cannot mark a no-show in the middle).
 */
export async function closeDayCmd(
  tx: Tx,
  ctx: TenantContext,
  input: {
    countedCash: Cents;
    leftInDrawer?: Cents;
    reason?: string | null;
    decisions: Readonly<Record<string, DayDecision>>;
    confirmed: boolean;
    at?: Date;
  },
): Promise<Result<DayCloseResult>> {
  const register: CashRegister | null = await getOpenRegister(tx, "update");
  const movements = register ? await listCashMovements(tx, register.id) : [];
  const comandas = register ? await listForDayClose(tx, register.openedAt, { lock: true }) : [];
  const settings = await getSettings(tx);
  const result = closeDay(ctx, {
    register,
    movements,
    comandas,
    countedCash: input.countedCash,
    leftInDrawer: input.leftInDrawer,
    reason: input.reason ?? null,
    decisions: input.decisions,
    confirmed: input.confirmed,
    expiryDays: pendingExpiry(settings),
    at: input.at ?? new Date(),
  });
  if (!result.ok) return result;
  await saveClosedRegister(tx, result.value.register);
  for (const comanda of [...result.value.discarded, ...result.value.noShows, ...result.value.pending]) await saveComanda(tx, comanda);
  await insertAudit(tx, result.value.audits);
  return result;
}
