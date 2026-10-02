import { describe, expect, it } from "vitest";
import { expectedCash, salesByMethod } from "@/modules/finance/rules/cash-register";
import { unwrap } from "@/shared/result";
import {
  addItem,
  applyDiscount,
  canView,
  cancelComanda,
  changePaymentMethod,
  closeComanda,
  comandaTotal,
  discardComanda,
  isComandaOf,
  markNoShow,
  openComanda,
  removeItem,
  setNote,
} from "./comanda";
import {
  appointment,
  barba,
  barberRef,
  clientRef,
  corte,
  diego,
  expectError,
  HOUR,
  intruder,
  lamina,
  newComanda,
  nextId,
  NOW,
  openCash,
  owner,
  pomada,
  rafael,
  SHOP,
  withProduct,
  withService,
} from "@/test/fixtures";

describe("open", () => {
  it("R-CMD-01: barber opens a walk-in comanda in his name", () => {
    const c = newComanda(rafael, 1028);
    expect(c).toMatchObject({ number: 1028, clientId: null, openedBy: "rafael", status: "open", items: [], removedItems: [], appointment: null, barbershopId: SHOP });
  });

  it("rejects a client from another barbershop", () => {
    expectError(openComanda(rafael, { id: "x", number: 1, client: { id: "c", barbershopId: "shop-b", anonymizedAt: null }, at: NOW }), "WRONG_TENANT");
  });

  it("rejects an anonymized client", () => {
    expectError(openComanda(rafael, { id: "x", number: 1, client: { id: "c", barbershopId: SHOP, anonymizedAt: NOW }, at: NOW }), "INVALID_INPUT");
  });
});

describe("appointments (R-CMD-20)", () => {
  const book = (ctx: typeof rafael, at: Date, barber = ctx, client: ReturnType<typeof clientRef> | null = clientRef()) =>
    openComanda(ctx, { id: "x", number: 1, client, at: NOW, appointment: { at, barber: barberRef(barber) } });
  const hours = (h: number) => new Date(NOW.getTime() + h * HOUR);

  it("a barber books a registered client for himself", () => {
    const c = appointment(rafael, 5, 3);
    expect(c.appointment).toEqual({ at: hours(3), barberId: "rafael" });
    expect(c.status).toBe("open");
  });

  it("the owner books for any barber, and that barber sees it as his own comanda", () => {
    const c = appointment(owner, 6, 24, diego);
    expect(c.openedBy).toBe("carlos");
    expect(isComandaOf(c, "diego")).toBe(true);
    expect(canView(diego, c)).toBe(true);
    expect(canView(rafael, c)).toBe(false);
  });

  it("a barber cannot book in another barber's name", () => {
    expectError(book(rafael, hours(3), diego), "FORBIDDEN");
  });

  it("needs a registered client (a walk-in has no name to wait for)", () => {
    expectError(book(rafael, hours(3), rafael, null), "INVALID_INPUT");
  });

  it("cannot be in the past, nor more than 14 days ahead", () => {
    expectError(book(rafael, hours(-1)), "INVALID_INPUT");
    expect(book(rafael, hours(14 * 24)).ok).toBe(true);
    expectError(book(rafael, hours(14 * 24 + 1)), "INVALID_INPUT");
  });

  it("rejects inactive barber and barber from another shop", () => {
    expectError(openComanda(owner, { id: "x", number: 1, client: clientRef(), at: NOW, appointment: { at: hours(2), barber: barberRef(diego, false) } }), "INVALID_INPUT");
    expectError(openComanda(owner, { id: "x", number: 1, client: clientRef(), at: NOW, appointment: { at: hours(2), barber: barberRef(intruder) } }), "WRONG_TENANT");
  });
});

describe("ownership (R-CMD-02/03)", () => {
  it("own = opened by him or with an item of his", () => {
    const byDiego = withService(newComanda(diego), owner, corte, rafael);
    expect(isComandaOf(byDiego, "rafael")).toBe(true);
    expect(isComandaOf(newComanda(diego), "rafael")).toBe(false);
  });

  it("barber sees only own comandas; owner sees all; nobody sees other tenants", () => {
    const c = newComanda(diego);
    expect(canView(rafael, c)).toBe(false);
    expect(canView(diego, c)).toBe(true);
    expect(canView(owner, c)).toBe(true);
    expect(canView(intruder, c)).toBe(false);
  });

  it("barber cannot edit another barber's comanda", () => {
    expectError(addItem(rafael, newComanda(diego), { itemId: "i", source: { kind: "service", service: corte }, quantity: 1, barber: barberRef(rafael), at: NOW }), "FORBIDDEN");
  });

  it("R-TEN-01: an owner of another barbershop cannot touch it", () => {
    expectError(addItem(intruder, newComanda(rafael), { itemId: "i", source: { kind: "service", service: corte }, quantity: 1, barber: barberRef(intruder), at: NOW }), "WRONG_TENANT");
  });
});

describe("items", () => {
  it("R-CMD-05: copies name and price at the moment it is added", () => {
    const c = withService(newComanda(), rafael, corte);
    const later = { ...corte, price: 9900, name: "Corte premium" };
    expect(c.items[0]).toMatchObject({ name: "Corte", unitPrice: 4500, barberId: "rafael", addedBy: "rafael", soldWithoutStock: null });
    expect(later.price).not.toBe(c.items[0].unitPrice);
  });

  it("R-CMD-06: barber cannot put an item in another barber's name; owner can", () => {
    const c = newComanda(rafael);
    expectError(addItem(rafael, c, { itemId: "i", source: { kind: "service", service: corte }, quantity: 1, barber: barberRef(diego), at: NOW }), "FORBIDDEN");
    const byOwner = unwrap(addItem(owner, c, { itemId: "i", source: { kind: "service", service: corte }, quantity: 1, barber: barberRef(diego), at: NOW }));
    expect(byOwner.items[0].barberId).toBe("diego");
  });

  it("rejects inactive barber, inactive service, internal product and invalid quantity", () => {
    const c = newComanda(owner);
    const add = (source: Parameters<typeof addItem>[2]["source"], quantity = 1, active = true) =>
      addItem(owner, c, { itemId: "i", source, quantity, barber: barberRef(diego, active), at: NOW });
    expectError(add({ kind: "service", service: corte }, 1, false), "INVALID_INPUT");
    expectError(add({ kind: "service", service: { ...corte, active: false } }), "INVALID_INPUT");
    expectError(add({ kind: "product", product: lamina }), "INVALID_INPUT");
    expectError(add({ kind: "service", service: corte }, 0), "INVALID_INPUT");
    expectError(add({ kind: "service", service: corte }, 1.5), "INVALID_INPUT");
    expectError(add({ kind: "service", service: corte }, 21), "INVALID_INPUT");
    expectError(add({ kind: "service", service: { ...corte, barbershopId: "shop-b" } }), "WRONG_TENANT");
  });

  it("R-CMD-08/21: barber removes only his own items; removed items are kept in a trail", () => {
    let c = withService(newComanda(rafael), rafael);
    c = withService(c, owner, barba, diego);
    const diegoItem = c.items.find((i) => i.barberId === "diego")!;
    const rafaelItem = c.items.find((i) => i.barberId === "rafael")!;
    expectError(removeItem(rafael, c, diegoItem.id, NOW), "FORBIDDEN");
    expectError(removeItem(rafael, c, "missing", NOW), "INVALID_INPUT");
    const after = unwrap(removeItem(rafael, c, rafaelItem.id, NOW));
    expect(after.items).toHaveLength(1);
    expect(after.removedItems).toEqual([{ item: rafaelItem, by: "rafael", at: NOW }]);
  });

  it("R-CMD-21: add, remove everything, discard — the trail stays on the discarded comanda", () => {
    const c = withService(newComanda(rafael), rafael);
    const empty = unwrap(removeItem(rafael, c, c.items[0].id, NOW));
    const discarded = unwrap(discardComanda(rafael, empty, NOW));
    expect(discarded.status).toBe("discarded");
    expect(discarded.removedItems).toHaveLength(1);
  });

  it("R-CMD-09: note is trimmed and limited", () => {
    const c = newComanda();
    expect(unwrap(setNote(rafael, c, "  R$ 20 dinheiro + R$ 25 Pix ")).note).toBe("R$ 20 dinheiro + R$ 25 Pix");
    expect(unwrap(setNote(rafael, c, "   ")).note).toBeNull();
    expectError(setNote(rafael, c, "x".repeat(281)), "INVALID_INPUT");
  });
});

describe("stock confirmation (R-STK-04, revised)", () => {
  it("enough stock: no question asked", () => {
    expect(withProduct(newComanda(), rafael, pomada, 2).items[0].soldWithoutStock).toBeNull();
  });

  it("not enough stock: the item is NOT added until the person confirms he has it in hand", () => {
    const c = newComanda();
    const add = (confirmInHand?: boolean, product = pomada, quantity = 3) =>
      addItem(rafael, c, { itemId: "i", source: { kind: "product", product }, quantity, barber: barberRef(rafael), confirmInHand, at: NOW });
    expectError(add(), "NEEDS_CONFIRMATION");
    expectError(add(false), "NEEDS_CONFIRMATION");
    const confirmed = unwrap(add(true));
    expect(confirmed.items[0].soldWithoutStock).toEqual({ confirmedBy: "rafael", at: NOW });
    expectError(add(undefined, { ...pomada, stock: 0 }, 1), "NEEDS_CONFIRMATION");
    expectError(add(undefined, { ...pomada, stock: -3 }, 1), "NEEDS_CONFIRMATION");
  });

  it("counts what is already in the same comanda (2 in stock: 2 ok, the 3rd needs confirmation)", () => {
    const c = withProduct(newComanda(), rafael, pomada, 2);
    expectError(
      addItem(rafael, c, { itemId: "i", source: { kind: "product", product: pomada }, quantity: 1, barber: barberRef(rafael), at: NOW }),
      "NEEDS_CONFIRMATION",
    );
  });

  it("closing a comanda with an unconfirmed-stock sale audits who confirmed it, and stock goes negative", () => {
    const { register } = openCash();
    const c = withProduct(newComanda(), rafael, pomada, 3, true);
    const { stockMovements, audits } = unwrap(closeComanda(rafael, c, { method: "pix", receivedCash: null, at: NOW }, register));
    expect(stockMovements[0]).toMatchObject({ type: "sale", quantity: -3 });
    expect(pomada.stock + stockMovements[0].quantity).toBe(-1);
    expect(audits).toEqual([expect.objectContaining({ action: "comanda.sold_without_stock", userId: "rafael", details: { number: 1, product: "Pomada", quantity: 3 } })]);
  });
});

describe("discount (R-CMD-10/17)", () => {
  it("only the owner gives discounts, and it is audited", () => {
    const c = withService(newComanda(), rafael);
    expectError(applyDiscount(rafael, c, 500, NOW), "FORBIDDEN");
    const { comanda, audit } = unwrap(applyDiscount(owner, c, 500, NOW));
    expect(comandaTotal(comanda)).toBe(4000);
    expect(comanda.discount).toMatchObject({ amount: 500, givenBy: "carlos" });
    expect(audit).toMatchObject({ action: "comanda.discount", userId: "carlos", details: { amount: 500, subtotal: 4500 } });
  });

  it("cannot be negative, fractional or bigger than the subtotal; 0 removes it", () => {
    const c = withService(newComanda(), rafael);
    expectError(applyDiscount(owner, c, -1, NOW), "INVALID_INPUT");
    expectError(applyDiscount(owner, c, 10.5, NOW), "INVALID_INPUT");
    expectError(applyDiscount(owner, c, 4501, NOW), "INVALID_INPUT");
    expect(unwrap(applyDiscount(owner, c, 4500, NOW)).comanda.discount?.amount).toBe(4500);
    const withDiscount = unwrap(applyDiscount(owner, c, 500, NOW)).comanda;
    expect(unwrap(applyDiscount(owner, withDiscount, 0, NOW)).comanda.discount).toBeNull();
  });

  it("changing items removes the discount", () => {
    const c = unwrap(applyDiscount(owner, withService(newComanda(), rafael), 500, NOW)).comanda;
    expect(withService(c, rafael, barba).discount).toBeNull();
    expect(unwrap(removeItem(rafael, c, c.items[0].id, NOW)).discount).toBeNull();
  });
});

describe("close (R-CMD-11)", () => {
  it("walk-in + Corte + Pix: closes and creates one Pix sale movement", () => {
    const { register } = openCash();
    const c = withService(newComanda(rafael, 1028), rafael);
    const { comanda, cashMovements, stockMovements, audits } = unwrap(closeComanda(rafael, c, { method: "pix", receivedCash: null, at: NOW }, register));
    expect(comanda).toMatchObject({ status: "closed", closedBy: "rafael", payment: { method: "pix", total: 4500, registerId: register.id } });
    expect(cashMovements).toEqual([expect.objectContaining({ type: "sale", method: "pix", amount: 4500, comandaId: c.id, description: "Comanda #1028" })]);
    expect(stockMovements).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("products create stock movements (out)", () => {
    const { register } = openCash();
    const c = withProduct(withService(newComanda(), rafael), rafael, pomada, 2);
    const { stockMovements } = unwrap(closeComanda(rafael, c, { method: "credit", receivedCash: null, at: NOW }, register));
    expect(stockMovements).toEqual([expect.objectContaining({ productId: "p-pomada", type: "sale", quantity: -2 })]);
  });

  it("cash: calculates change; refuses too little money", () => {
    const { register } = openCash();
    const c = withService(newComanda(), rafael, barba);
    expect(unwrap(closeComanda(rafael, c, { method: "cash", receivedCash: 5000, at: NOW }, register)).comanda.payment?.change).toBe(1500);
    expectError(closeComanda(rafael, c, { method: "cash", receivedCash: 3000, at: NOW }, register), "INVALID_INPUT");
    expectError(closeComanda(rafael, c, { method: "pix", receivedCash: 5000, at: NOW }, register), "INVALID_INPUT");
  });

  it("refuses: empty comanda, closed register, already closed", () => {
    const { register } = openCash();
    expectError(closeComanda(rafael, newComanda(), { method: "pix", receivedCash: null, at: NOW }, register), "INVALID_STATE");
    const c = withService(newComanda(), rafael);
    expectError(closeComanda(rafael, c, { method: "pix", receivedCash: null, at: NOW }, null), "INVALID_STATE");
    expectError(closeComanda(rafael, c, { method: "pix", receivedCash: null, at: NOW }, { ...register, status: "closed" }), "INVALID_STATE");
    const closed = unwrap(closeComanda(rafael, c, { method: "pix", receivedCash: null, at: NOW }, register)).comanda;
    expectError(closeComanda(rafael, closed, { method: "pix", receivedCash: null, at: NOW }, register), "INVALID_STATE");
  });

  it("100% discount closes with no cash movement", () => {
    const { register } = openCash();
    const c = unwrap(applyDiscount(owner, withService(newComanda(), rafael), 4500, NOW)).comanda;
    const result = unwrap(closeComanda(owner, c, { method: "cash", receivedCash: null, at: NOW }, register));
    expect(result.comanda.payment?.total).toBe(0);
    expect(result.cashMovements).toEqual([]);
  });

  it("a pending comanda that is paid is no longer pending", () => {
    const { register } = openCash();
    const pending = { ...withService(newComanda(), rafael), pendingSince: NOW };
    expect(unwrap(closeComanda(rafael, pending, { method: "pix", receivedCash: null, at: NOW }, register)).comanda.pendingSince).toBeNull();
  });
});

describe("no-show (R-CMD-19) — not a cancellation", () => {
  const after = (c: ReturnType<typeof appointment>, hours: number) => new Date(c.appointment!.at.getTime() + hours * HOUR);

  it("the barber marks it after the appointment time: paused, recorded, audited, NOT cancelled", () => {
    const c = withService(appointment(rafael, 7, 3), rafael);
    const { comanda, audit } = unwrap(markNoShow(rafael, c, after(c, 0.5)));
    expect(comanda.status).toBe("no_show");
    expect(comanda.status).not.toBe("cancelled");
    expect(comanda.cancellation).toBeNull();
    expect(comanda.noShow).toEqual({ by: "rafael", at: after(c, 0.5) });
    expect(audit).toMatchObject({ action: "comanda.no_show", userId: "rafael", details: { number: 7, itemCount: 1, total: 4500 } });
  });

  it("not before the appointment time", () => {
    const c = appointment(rafael, 7, 3);
    expectError(markNoShow(rafael, c, NOW), "NOT_ALLOWED");
    expect(markNoShow(rafael, c, c.appointment!.at).ok).toBe(true);
  });

  it("only comandas that are appointments", () => {
    expectError(markNoShow(rafael, newComanda(), NOW), "INVALID_STATE");
  });

  it("only that barber or the owner; never another barber or another shop", () => {
    const c = appointment(rafael, 7, 1);
    const late = after(c, 1);
    expectError(markNoShow(diego, c, late), "FORBIDDEN");
    expectError(markNoShow(intruder, c, late), "WRONG_TENANT");
    expect(markNoShow(owner, c, late).ok).toBe(true);
  });

  it("cannot be done twice or on a paid comanda; no money or stock is touched", () => {
    const { register } = openCash();
    const c = appointment(rafael, 7, 1);
    const noShow = unwrap(markNoShow(rafael, c, after(c, 1))).comanda;
    expectError(markNoShow(rafael, noShow, after(c, 2)), "INVALID_STATE");
    const paid = unwrap(closeComanda(rafael, withService(appointment(rafael, 8, 1), rafael), { method: "pix", receivedCash: null, at: NOW }, register)).comanda;
    expectError(markNoShow(rafael, paid, after(paid as never, 2)), "INVALID_STATE");
  });

  it("a no-show comanda cannot be paid or edited (it is paused)", () => {
    const { register } = openCash();
    const c = withService(appointment(rafael, 7, 1), rafael);
    const noShow = unwrap(markNoShow(rafael, c, after(c, 1))).comanda;
    expectError(closeComanda(rafael, noShow, { method: "pix", receivedCash: null, at: NOW }, register), "INVALID_STATE");
    expectError(addItem(rafael, noShow, { itemId: "i", source: { kind: "service", service: corte }, quantity: 1, barber: barberRef(rafael), at: NOW }), "INVALID_STATE");
  });
});

describe("discard and cancel (R-CMD-14/15)", () => {
  it("empty comanda is discarded without reason; with items it cannot be discarded", () => {
    expect(unwrap(discardComanda(rafael, newComanda(), NOW)).status).toBe("discarded");
    expectError(discardComanda(rafael, withService(newComanda(), rafael), NOW), "NOT_ALLOWED");
  });

  it("R-CMD-19: a BARBER cannot cancel an open comanda — not even his own", () => {
    const c = withService(newComanda(), rafael);
    expectError(cancelComanda(rafael, c, { reason: "Cliente desistiu", at: NOW }, null), "FORBIDDEN");
    expectError(cancelComanda(diego, c, { reason: "Não é minha", at: NOW }, null), "FORBIDDEN");
  });

  it("the OWNER cancels an open comanda with a reason; audited", () => {
    const c = withService(newComanda(), rafael);
    expectError(cancelComanda(owner, c, { reason: "x", at: NOW }, null), "INVALID_INPUT");
    const { comanda, cashMovements, audit } = unwrap(cancelComanda(owner, c, { reason: "Cliente desistiu", at: NOW }, null));
    expect(comanda).toMatchObject({ status: "cancelled", cancellation: { reason: "Cliente desistiu", by: "carlos" } });
    expect(cashMovements).toEqual([]);
    expect(audit.action).toBe("comanda.cancel");
    expectError(cancelComanda(owner, newComanda(), { reason: "Vazia mesmo", at: NOW }, null), "NOT_ALLOWED");
  });

  it("closed comanda: only the owner, and money + products go back", () => {
    const { register, movements } = openCash();
    const c = withProduct(withService(newComanda(), rafael), rafael);
    const closed = unwrap(closeComanda(rafael, c, { method: "cash", receivedCash: null, at: NOW }, register));
    expectError(cancelComanda(rafael, closed.comanda, { reason: "Erro no lançamento", at: NOW }, register), "FORBIDDEN");
    expectError(cancelComanda(owner, closed.comanda, { reason: "Erro no lançamento", at: NOW }, null), "INVALID_STATE");

    const cancelled = unwrap(cancelComanda(owner, closed.comanda, { reason: "Erro no lançamento", at: NOW }, register));
    expect(cancelled.cashMovements).toEqual([expect.objectContaining({ type: "sale_reversal", method: "cash", amount: -9000 })]);
    expect(cancelled.stockMovements).toEqual([expect.objectContaining({ type: "sale_reversal", quantity: 1 })]);
    const all = [...movements, ...closed.cashMovements, ...cancelled.cashMovements];
    expect(expectedCash(all)).toBe(10000);
    expectError(cancelComanda(owner, cancelled.comanda, { reason: "De novo", at: NOW }, register), "INVALID_STATE");
  });
});

describe("change payment method (R-CMD-16)", () => {
  it("owner corrects Pix recorded as cash while the register is open", () => {
    const { register, movements } = openCash();
    const closed = unwrap(closeComanda(rafael, withService(newComanda(), rafael), { method: "cash", receivedCash: null, at: NOW }, register));
    expectError(changePaymentMethod(rafael, closed.comanda, { method: "pix", reason: "Era Pix", at: NOW }, register), "FORBIDDEN");
    expectError(changePaymentMethod(owner, closed.comanda, { method: "cash", reason: "Era Pix", at: NOW }, register), "INVALID_INPUT");
    expectError(changePaymentMethod(owner, closed.comanda, { method: "pix", reason: "?", at: NOW }, register), "INVALID_INPUT");

    const fixed = unwrap(changePaymentMethod(owner, closed.comanda, { method: "pix", reason: "Cliente pagou no Pix", at: NOW }, register));
    expect(fixed.comanda.payment?.method).toBe("pix");
    const all = [...movements, ...closed.cashMovements, ...fixed.cashMovements];
    expect(expectedCash(all)).toBe(10000);
    expect(salesByMethod(all)).toEqual({ cash: 0, pix: 4500, debit: 0, credit: 0 });
    expect(fixed.audit).toMatchObject({ action: "comanda.payment_method_changed", details: { from: "cash", to: "pix" } });
  });

  it("is not possible after that register was closed (a closed register is a sealed day)", () => {
    const first = openCash();
    const closed = unwrap(closeComanda(rafael, withService(newComanda(), rafael), { method: "cash", receivedCash: null, at: NOW }, first.register));
    const nextDay = openCash();
    expectError(changePaymentMethod(owner, closed.comanda, { method: "pix", reason: "Era Pix", at: NOW }, nextDay.register), "NOT_ALLOWED");
  });
});

it("full day: barber flow keeps cash, sales and stock consistent", () => {
  const { register, movements } = openCash(10000);
  const sales = [
    closeComanda(rafael, withService(newComanda(rafael, 1), rafael), { method: "pix", receivedCash: null, at: NOW }, register),
    closeComanda(diego, withProduct(withService(newComanda(diego, 2), diego, barba), diego), { method: "cash", receivedCash: 10000, at: NOW }, register),
  ].map(unwrap);
  const all = [...movements, ...sales.flatMap((s) => s.cashMovements)];
  expect(expectedCash(all)).toBe(10000 + 8000);
  expect(salesByMethod(all)).toEqual({ cash: 8000, pix: 4500, debit: 0, credit: 0 });
  expect(sales[1].comanda.payment?.change).toBe(2000);
  expect(sales.flatMap((s) => s.stockMovements).map((m) => m.quantity)).toEqual([-1]);
  expect(nextId()).toBeTruthy();
});
