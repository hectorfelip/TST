/** The read queries behind the day lists and the monthly report, against a real PostgreSQL. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moneyTotals } from "@/modules/finance/data/reports.repo";
import { recordExpenseCmd, recordWithdrawalCmd } from "@/modules/finance/data/commands";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { at, createWorld, HOUR, openCash, type World } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { addItemCmd, applyDiscountCmd, cancelComandaCmd, closeComandaCmd, discardComandaCmd, markNoShowCmd, openComandaCmd } from "./commands";
import { listClosedBetween, listComandas, listFinishedBetween } from "./comandas.repo";
import { barberTotals, topServices } from "./reports.repo";

let db: TestDb;
let w: World;
const day = { from: at(-2), to: at(10) };

beforeAll(async () => {
  db = await createTestDb();
  w = await createWorld(db);
  await openCash(db, w.shop, 10000, w.owner, at(-1));
  const sell = async (who: TenantContext, items: { kind: "service" | "product"; ref: string; qty?: number; barber?: TenantContext }[], method: "pix" | "cash" | "credit", when: number, discount = 0) => {
    const c = unwrap(await db.as(who, (tx) => openComandaCmd(tx, who, { at: at(when) })));
    for (const i of items) unwrap(await db.as(who, (tx) => addItemCmd(tx, who, c.id, { kind: i.kind, refId: i.ref, quantity: i.qty ?? 1, barberId: (i.barber ?? who).userId, at: at(when) })));
    if (discount) unwrap(await db.as(w.owner, (tx) => applyDiscountCmd(tx, w.owner, c.id, discount, at(when))));
    unwrap(await db.as(who, (tx) => closeComandaCmd(tx, who, c.id, { method, receivedCash: null, at: at(when + 0.1) })));
    return c;
  };
  await sell(w.rafael, [{ kind: "service", ref: w.corte }, { kind: "service", ref: w.barba }], "pix", 0); // 80,00
  await sell(w.diego, [{ kind: "service", ref: w.corte, qty: 2 }], "cash", 1); // 90,00
  await sell(w.owner, [{ kind: "service", ref: w.corte, barber: w.rafael }, { kind: "product", ref: w.pomada }], "credit", 2, 500); // 90,00 - 5,00
  // a cancelled paid comanda, a no-show, a discarded empty one and an open one
  const cancelled = await sell(w.rafael, [{ kind: "service", ref: w.barba }], "pix", 3);
  unwrap(await db.as(w.owner, (tx) => cancelComandaCmd(tx, w.owner, cancelled.id, { reason: "Cobrado em duplicidade", at: at(3.5) })));
  const noShow = unwrap(await db.as(w.owner, (tx) => openComandaCmd(tx, w.owner, { clientId: w.marcos, appointment: { at: at(4), barberId: w.rafael.userId }, at: at(3.6) })));
  unwrap(await db.as(w.rafael, (tx) => markNoShowCmd(tx, w.rafael, noShow.id, at(4.5))));
  const empty = unwrap(await db.as(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(5) })));
  unwrap(await db.as(w.rafael, (tx) => discardComandaCmd(tx, w.rafael, empty.id, at(5.1))));
  unwrap(await db.as(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(6) })));
  unwrap(await db.as(w.owner, (tx) => recordExpenseCmd(tx, w.owner, { amount: 1850, method: "cash", description: "Café", at: at(6) })));
  unwrap(await db.as(w.owner, (tx) => recordWithdrawalCmd(tx, w.owner, { amount: 3000, reason: "Retirada do dono", at: at(7) })));
});

afterAll(async () => {
  await db.close();
});

describe("lists of the day", () => {
  it("finished comandas: paid, cancelled and no-show appear; discarded and open do not", async () => {
    const list = await db.as(w.owner, (tx) => listFinishedBetween(tx, day.from, day.to));
    expect(list.map((c) => [c.number, c.status]).sort()).toEqual([[1, "closed"], [2, "closed"], [3, "closed"], [4, "cancelled"], [5, "no_show"]]);
  });

  it("the period is respected (a comanda finished outside it is not listed)", async () => {
    const list = await db.as(w.owner, (tx) => listFinishedBetween(tx, at(0.5), at(2.5)));
    expect(list.map((c) => c.number)).toEqual([3, 2]);
  });

  it("paid comandas of a period do not include the cancelled one", async () => {
    const list = await db.as(w.owner, (tx) => listClosedBetween(tx, day.from, day.to));
    expect(list.map((c) => c.number).sort()).toEqual([1, 2, 3]);
  });

  it("open comandas", async () => {
    const list = await db.as(w.owner, (tx) => listComandas(tx, { statuses: ["open"] }));
    expect(list.map((c) => c.number)).toEqual([7]);
  });
});

describe("report numbers", () => {
  it("per barber: only paid comandas, only the items that barber did, before discounts", async () => {
    const totals = await db.as(w.owner, (tx) => barberTotals(tx, day.from, day.to));
    const byId = Object.fromEntries(totals.map((t) => [t.barberId, t]));
    // Rafael: Corte+Barba (80,00) + Corte in the owner's comanda (45,00); the cancelled comanda does not count
    expect(byId[w.rafael.userId]).toEqual({ barberId: w.rafael.userId, comandas: 2, revenue: 8000 + 4500 });
    expect(byId[w.diego.userId]).toEqual({ barberId: w.diego.userId, comandas: 1, revenue: 9000 });
    expect(byId[w.owner.userId]).toEqual({ barberId: w.owner.userId, comandas: 1, revenue: 4500 }); // the Pomada he sold
  });

  it("most sold services count quantities and ignore products and cancelled comandas", async () => {
    const top = await db.as(w.owner, (tx) => topServices(tx, day.from, day.to));
    expect(top).toEqual([{ name: "Corte", count: 4 }, { name: "Barba", count: 1 }]);
  });

  it("money: income after discount and refunds, expenses and withdrawals apart, per payment method", async () => {
    const m = await db.as(w.owner, (tx) => moneyTotals(tx, day.from, day.to));
    // sales 80,00 pix + 90,00 cash + 85,00 credit + 35,00 pix (cancelled: refunded)
    expect(m.income).toBe(8000 + 9000 + 8500);
    expect(m.expenses).toBe(1850);
    expect(m.withdrawals).toBe(3000);
    expect(m.byMethod).toEqual({ cash: 9000, pix: 8000, debit: 0, credit: 8500 });
  });

  it("an empty period gives zeros, not errors", async () => {
    const m = await db.as(w.owner, (tx) => moneyTotals(tx, at(100), at(200)));
    expect(m).toEqual({ income: 0, expenses: 0, withdrawals: 0, byMethod: { cash: 0, pix: 0, debit: 0, credit: 0 } });
    expect(await db.as(w.owner, (tx) => barberTotals(tx, at(100), at(200)))).toEqual([]);
  });
});

void HOUR;
