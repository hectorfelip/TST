/**
 * Comanda actions against a REAL PostgreSQL: rules + database together.
 * The question each test answers: "is everything saved together, or nothing,
 * and does it stay true when two people act at the same instant?"
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { getOpenRegisterReport } from "@/modules/finance/data/commands";
import { getOpenRegister, getRegister } from "@/modules/finance/data/registers.repo";
import { getProduct } from "@/modules/inventory/data/inventory.repo";
import { clientViewCmd } from "@/modules/clients/data/commands";
import { noShowCountOf } from "@/modules/clients/data/clients.repo";
import { expectPgError, PG, T0, type TestDb } from "@/test/db/helpers";
import { createTestDb, withSlowWrites } from "@/test/db/helpers";
import { at, createWorld, HOUR, openCash, type World } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import type { Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
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
  planDayCloseCmd,
  removeItemCmd,
  setNoteCmd,
} from "./commands";
import { getComanda, listAppointments, listComandas } from "./comandas.repo";
import { forgetOldKeys, runExpiryJob } from "./jobs";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

/** Runs a command as the application does: ONE transaction for ONE barbershop. */
const run = <T>(ctx: TenantContext, fn: (tx: Parameters<Parameters<TestDb["as"]>[1]>[0]) => Promise<Result<T>>) => db.as(ctx, fn);

const rows = async (sql: string, params: unknown[] = []) => (await db.adminPool.query(sql, params)).rows;

async function service(w: World, ctx: TenantContext, comandaId: string, kind: "service" | "product", refId: string, over: Record<string, unknown> = {}) {
  return run(ctx, (tx) => addItemCmd(tx, ctx, comandaId, { kind, refId, quantity: 1, barberId: ctx.userId, at: at(0), ...over }));
}

describe("one comanda from start to payment", () => {
  it("walk-in + Corte + Pomada, paid in Pix: comanda, money, stock and revenue are saved TOGETHER", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop, 10000, w.rafael); // a BARBER opens the register
    const opened = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    expect(opened.number).toBe(1);
    unwrap(await service(w, w.rafael, opened.id, "service", w.corte));
    unwrap(await service(w, w.rafael, opened.id, "product", w.pomada));
    const closed = unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, opened.id, { method: "pix", at: at(0.1) })));

    expect(closed).toMatchObject({ status: "closed", closedBy: w.rafael.userId, payment: { method: "pix", total: 9000 } });
    const movements = await rows("SELECT type, method, amount_cents FROM cash_movements WHERE type = 'sale' AND barbershop_id = $1", [w.shop.id]);
    expect(movements).toEqual([{ type: "sale", method: "pix", amount_cents: 9000 }]);
    const stock = await rows("SELECT type, quantity FROM stock_movements WHERE type = 'sale' AND barbershop_id = $1", [w.shop.id]);
    expect(stock).toEqual([{ type: "sale", quantity: -1 }]);
    // Derived values: stock = 2 - 1; cash in the drawer ignores Pix.
    const product = await run(w.owner, async (tx) => ({ ok: true as const, value: await getProduct(tx, w.pomada) }));
    expect(unwrap(product)?.stock).toBe(1);
    const report = await db.as(w.owner, (tx) => getOpenRegisterReport(tx));
    expect(report).toMatchObject({ expectedCash: 10000, salesByMethod: { cash: 0, pix: 9000, debit: 0, credit: 0 } });
  });

  it("what is loaded is EXACTLY what the rules returned (items, removed item, discount, note, appointment, cash)", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const booked = unwrap(await run(w.owner, (tx) => openComandaCmd(tx, w.owner, { clientId: w.marcos, appointment: { at: at(3), barberId: w.rafael.userId }, at: at(0) })));
    unwrap(await service(w, w.rafael, booked.id, "service", w.corte));
    const withTwo = unwrap(await service(w, w.rafael, booked.id, "service", w.barba));
    unwrap(await run(w.rafael, (tx) => removeItemCmd(tx, w.rafael, booked.id, withTwo.items[1].id, at(0.5))));
    unwrap(await service(w, w.rafael, booked.id, "product", w.pomada));
    unwrap(await run(w.rafael, (tx) => setNoteCmd(tx, w.rafael, booked.id, "R$ 20 dinheiro + R$ 25 Pix")));
    unwrap(await run(w.owner, (tx) => applyDiscountCmd(tx, w.owner, booked.id, 500, at(0.6))));
    const returned = unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, booked.id, { method: "cash", receivedCash: 10000, at: at(3.2) })));

    const loaded = await db.as(w.owner, (tx) => getComanda(tx, booked.id));
    expect(loaded).toEqual(returned);
    expect(loaded?.removedItems).toHaveLength(1);
    expect(loaded?.discount).toMatchObject({ amount: 500, givenBy: w.owner.userId });
    expect(loaded?.payment).toMatchObject({ method: "cash", total: 8500, receivedCash: 10000, change: 1500 });
    expect(loaded?.appointment).toEqual({ at: at(3), barberId: w.rafael.userId });
  });

  it("items are never deleted: a removed item stays in the table, marked, and the trail is on the comanda", async () => {
    const w = await createWorld(db);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    const added = unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    unwrap(await run(w.rafael, (tx) => removeItemCmd(tx, w.rafael, c.id, added.items[0].id, at(0.2))));
    const items = await rows("SELECT removed_by, removed_at IS NOT NULL AS removed FROM comanda_items WHERE comanda_id = $1", [c.id]);
    expect(items).toEqual([{ removed_by: w.rafael.userId, removed: true }]);
    const discarded = unwrap(await run(w.rafael, (tx) => discardComandaCmd(tx, w.rafael, c.id, at(0.3))));
    expect(discarded.status).toBe("discarded");
    expect(discarded.removedItems).toHaveLength(1); // R-CMD-21: add, remove, discard leaves a trail
  });
});

describe("everything or nothing", () => {
  it("if ANY step fails, the whole payment is rolled back: the comanda is still open, no money, no stock", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    unwrap(await service(w, w.rafael, c.id, "product", w.pomada, { quantity: 2 }));
    // Sabotage the LAST step (the stock movement), after the comanda and the cash movement were already written.
    await db.adminPool.query(`
      CREATE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disk exploded'; END $$;
      CREATE TRIGGER boom_trigger BEFORE INSERT ON stock_movements FOR EACH ROW WHEN (NEW.type = 'sale') EXECUTE FUNCTION boom();`);
    try {
      await expect(run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(0.1) }))).rejects.toThrow("disk exploded");
    } finally {
      await db.adminPool.query("DROP TRIGGER boom_trigger ON stock_movements; DROP FUNCTION boom()");
    }
    const after = await db.as(w.owner, (tx) => getComanda(tx, c.id));
    expect(after?.status).toBe("open");
    expect(after?.payment).toBeNull();
    expect(await rows("SELECT 1 FROM cash_movements WHERE comanda_id = $1", [c.id])).toEqual([]);
    expect(await rows("SELECT 1 FROM stock_movements WHERE comanda_id = $1", [c.id])).toEqual([]);
    // and once the problem is gone, the same payment works
    expect(unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(0.2) }))).status).toBe("closed");
  });

  it("a rule that refuses writes NOTHING (no half-saved effects)", async () => {
    const w = await createWorld(db);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    const refused = await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(0.1) })); // no register open
    expect(refused).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(await rows("SELECT 1 FROM cash_movements WHERE barbershop_id = $1", [w.shop.id])).toEqual([]);
    expect((await db.as(w.owner, (tx) => getComanda(tx, c.id)))?.status).toBe("open");
  });
});

describe("two people at the same instant", () => {
  it("the same comanda paid twice at once: ONE payment, ONE cash movement, ONE stock movement", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    unwrap(await service(w, w.rafael, c.id, "product", w.pomada));
    const results = await withSlowWrites(db, "cash_movements", "NEW.type = 'sale'", 0.4, () =>
      Promise.all([
        run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(0.1) })),
        run(w.owner, (tx) => closeComandaCmd(tx, w.owner, c.id, { method: "cash", at: at(0.1) })),
      ]),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "INVALID_STATE" } });
    expect(await rows("SELECT 1 FROM cash_movements WHERE comanda_id = $1 AND type = 'sale'", [c.id])).toHaveLength(1);
    expect(await rows("SELECT 1 FROM stock_movements WHERE comanda_id = $1 AND type = 'sale'", [c.id])).toHaveLength(1);
  });

  it("20 comandas opened at once get 20 different numbers, and a refused one does not use up a number", async () => {
    const w = await createWorld(db);
    const refused = await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { clientId: w.marcos, appointment: { at: at(-5), barberId: w.rafael.userId }, at: at(0) })); // in the past
    expect(refused).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const opened = await Promise.all(Array.from({ length: 20 }, () => run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) }))));
    const numbers = opened.map((r) => unwrap(r).number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("two people opening the register at once: only ONE register is opened", async () => {
    const w = await createWorld(db);
    const open = (ctx: TenantContext) => run(ctx, async (tx) => (await import("@/modules/finance/data/commands")).openRegisterCmd(tx, ctx, { openingCash: 10000, at: at(0) }));
    const results = await Promise.all([open(w.rafael), open(w.owner), open(w.diego)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results.filter((x) => !x.ok)) expect(r).toMatchObject({ error: { code: "INVALID_STATE" } }); // translated, not a crash
    expect(await rows("SELECT 1 FROM cash_registers WHERE barbershop_id = $1 AND status = 'open'", [w.shop.id])).toHaveLength(1);
  });

  it("closing the day twice at once: ONE closing; the second finds no open register", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const close = () => run(w.owner, (tx) => closeDayCmd(tx, w.owner, { countedCash: 10000, decisions: {}, confirmed: true, at: at(8) }));
    const results = await withSlowWrites(db, "cash_registers", "NEW.status = 'closed'", 0.4, () => Promise.all([close(), close()]), "UPDATE");
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "INVALID_STATE" } });
  });
});

describe("stock: the confirmation question (rule 3)", () => {
  it("3 pomadas with 2 in stock: asks first; with 'I have it in hand' it sells, is audited and stock goes negative", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    const asked = await service(w, w.rafael, c.id, "product", w.pomada, { quantity: 3 });
    expect(asked).toMatchObject({ ok: false, error: { code: "NEEDS_CONFIRMATION" } });
    expect((await db.as(w.owner, (tx) => getComanda(tx, c.id)))?.items).toEqual([]); // nothing was added
    unwrap(await service(w, w.rafael, c.id, "product", w.pomada, { quantity: 3, confirmInHand: true }));
    unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(0.1) })));
    expect((await db.as(w.owner, (tx) => getProduct(tx, w.pomada)))?.stock).toBe(-1);
    const audit = await db.as(w.owner, (tx) => listAudit(tx, { action: "comanda.sold_without_stock" }));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ userId: w.rafael.userId, details: { product: "Pomada", quantity: 3 } });
  });
});

describe("cancelling and correcting", () => {
  it("cancelling a PAID comanda returns the money and the products with reversal movements; history is kept", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    unwrap(await service(w, w.rafael, c.id, "product", w.pomada));
    unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "cash", at: at(0.1) })));
    expect(await run(w.rafael, (tx) => cancelComandaCmd(tx, w.rafael, c.id, { reason: "Erro no lançamento", at: at(0.2) }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const cancelled = unwrap(await run(w.owner, (tx) => cancelComandaCmd(tx, w.owner, c.id, { reason: "Erro no lançamento", at: at(0.2) })));
    expect(cancelled).toMatchObject({ status: "cancelled", cancellation: { by: w.owner.userId } });
    expect(await rows("SELECT type, amount_cents FROM cash_movements WHERE comanda_id = $1 ORDER BY created_at", [c.id])).toEqual([
      { type: "sale", amount_cents: 9000 },
      { type: "sale_reversal", amount_cents: -9000 },
    ]);
    expect((await db.as(w.owner, (tx) => getProduct(tx, w.pomada)))?.stock).toBe(2); // the pomada came back
    expect((await db.as(w.owner, (tx) => getOpenRegisterReport(tx)))?.expectedCash).toBe(10000);
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "comanda.cancel" }))).toHaveLength(1);
  });

  it("a barber cannot cancel an open comanda; the owner can; the discount is audited", async () => {
    const w = await createWorld(db);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    expect(await run(w.rafael, (tx) => cancelComandaCmd(tx, w.rafael, c.id, { reason: "Cliente desistiu" }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await run(w.rafael, (tx) => applyDiscountCmd(tx, w.rafael, c.id, 500))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    unwrap(await run(w.owner, (tx) => applyDiscountCmd(tx, w.owner, c.id, 500, at(0.1))));
    expect((await db.as(w.owner, (tx) => getComanda(tx, c.id)))?.discount?.amount).toBe(500);
    // changing the items removes the discount (R-CMD-17): the columns go back to NULL
    unwrap(await service(w, w.rafael, c.id, "service", w.barba));
    expect((await db.as(w.owner, (tx) => getComanda(tx, c.id)))?.discount).toBeNull();
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "comanda.discount" }))).toHaveLength(1);
    unwrap(await run(w.owner, (tx) => cancelComandaCmd(tx, w.owner, c.id, { reason: "Cliente desistiu", at: at(0.2) })));
  });

  it("a payment method can be corrected only while the register of that payment is open (a closed day is sealed)", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "cash", at: at(0.1) })));
    unwrap(await run(w.owner, (tx) => changePaymentMethodCmd(tx, w.owner, c.id, { method: "pix", reason: "Cliente pagou no Pix", at: at(0.2) })));
    const report = await db.as(w.owner, (tx) => getOpenRegisterReport(tx));
    expect(report).toMatchObject({ expectedCash: 10000, salesByMethod: { cash: 0, pix: 4500, debit: 0, credit: 0 } });
    unwrap(await run(w.owner, (tx) => closeDayCmd(tx, w.owner, { countedCash: 10000, decisions: {}, confirmed: true, at: at(8) })));
    expect(await run(w.owner, (tx) => changePaymentMethodCmd(tx, w.owner, c.id, { method: "cash", reason: "Era dinheiro, na verdade", at: at(9) }))).toMatchObject({ ok: false });
  });
});

describe("appointments and no-show", () => {
  it("a barber's agenda, the no-show (not a cancellation), and the client's absence count", async () => {
    const w = await createWorld(db);
    const mine = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { clientId: w.marcos, appointment: { at: at(3), barberId: w.rafael.userId }, at: at(0) })));
    const others = unwrap(await run(w.owner, (tx) => openComandaCmd(tx, w.owner, { clientId: w.andre, appointment: { at: at(4), barberId: w.diego.userId }, at: at(0) })));
    expect(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { clientId: w.andre, appointment: { at: at(4), barberId: w.diego.userId }, at: at(0) }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const agenda = await db.as(w.rafael, (tx) => listAppointments(tx, at(0), at(24)));
    expect(agenda.map((c) => c.id).sort()).toEqual([mine.id, others.id].sort()); // the query returns them; the RULE decides who sees which
    const { agendaBetween } = await import("../rules/appointments");
    expect(agendaBetween(w.rafael, agenda, { from: at(0), to: at(24) }).map((c) => c.id)).toEqual([mine.id]);

    expect(await run(w.rafael, (tx) => markNoShowCmd(tx, w.rafael, mine.id, at(2)))).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } }); // before its time
    const noShow = unwrap(await run(w.rafael, (tx) => markNoShowCmd(tx, w.rafael, mine.id, at(3.5))));
    expect(noShow).toMatchObject({ status: "no_show", cancellation: null, noShow: { by: w.rafael.userId } });
    expect(await db.as(w.owner, (tx) => noShowCountOf(tx, w.marcos))).toBe(1);
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "comanda.no_show" }))).toHaveLength(1);
    const after = await db.as(w.rafael, (tx) => listAppointments(tx, at(0), at(24)));
    expect(after.map((c) => c.id)).toEqual([others.id]); // it left the day's list
    // anyone can see the client's absence count; a barber never sees the phone (decision B)
    const view = unwrap(await db.as(w.rafael, (tx) => clientViewCmd(tx, w.rafael, w.marcos)));
    expect(view).toMatchObject({ phone: null, noShowCount: 1 });
  });
});

describe("closing the day (R-CSH-05/06/08)", () => {
  async function scene(w: World) {
    await openCash(db, w.shop, 10000, w.owner, at(-1));
    const open = (ctx: TenantContext, over: Record<string, unknown> = {}) => run(ctx, (tx) => openComandaCmd(tx, ctx, { at: at(0), ...over }));
    const walkInUnpaid = unwrap(await open(w.rafael));
    unwrap(await service(w, w.rafael, walkInUnpaid.id, "service", w.corte));
    const emptyWalkIn = unwrap(await open(w.rafael));
    const apptUnpaid = unwrap(await open(w.owner, { clientId: w.andre, appointment: { at: at(3), barberId: w.diego.userId } }));
    unwrap(await service(w, w.owner, apptUnpaid.id, "service", w.corte, { barberId: w.diego.userId }));
    const apptEmpty = unwrap(await open(w.owner, { clientId: w.andre, appointment: { at: at(4), barberId: w.diego.userId } }));
    const markedNoShow = unwrap(await open(w.rafael, { clientId: w.marcos, appointment: { at: at(1), barberId: w.rafael.userId } }));
    unwrap(await service(w, w.rafael, markedNoShow.id, "service", w.barba));
    unwrap(await run(w.rafael, (tx) => markNoShowCmd(tx, w.rafael, markedNoShow.id, at(2))));
    const tomorrow = unwrap(await open(w.owner, { clientId: w.marcos, appointment: { at: at(20), barberId: w.rafael.userId } }));
    const paid = unwrap(await open(w.rafael));
    unwrap(await service(w, w.rafael, paid.id, "service", w.corte));
    unwrap(await run(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, paid.id, { method: "pix", at: at(0.5) })));
    return { walkInUnpaid, emptyWalkIn, apptUnpaid, apptEmpty, markedNoShow, tomorrow, paid };
  }

  it("the plan alerts EVERY unpaid service and leaves out tomorrow's appointment", async () => {
    const w = await createWorld(db);
    const s = await scene(w);
    const plan = unwrap(await db.as(w.owner, (tx) => planDayCloseCmd(tx, w.owner, at(8))));
    expect(plan.entries.map((e) => [e.comanda.number, e.kind])).toEqual([
      [s.walkInUnpaid.number, "unpaid"],
      [s.emptyWalkIn.number, "empty"],
      [s.apptUnpaid.number, "unpaid"],
      [s.apptEmpty.number, "empty"],
      [s.markedNoShow.number, "no_show_with_items"],
    ]);
    expect(plan.atRiskTotal).toBe(4500 + 4500 + 3500);
    expect(await run(w.rafael, (tx) => planDayCloseCmd(tx, w.rafael, at(8)))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("closes the register and settles every comanda in ONE transaction; nothing is cancelled; the cash left is remembered", async () => {
    const w = await createWorld(db);
    const s = await scene(w);
    const decisions = {
      [s.walkInUnpaid.id]: "keep_pending",
      [s.emptyWalkIn.id]: "discard",
      [s.apptUnpaid.id]: "no_show",
      [s.apptEmpty.id]: "no_show",
      [s.markedNoShow.id]: "reviewed",
    } as const;
    // refused without the confirmation, or with a comanda left undecided: nothing happens
    expect(await run(w.owner, (tx) => closeDayCmd(tx, w.owner, { countedCash: 10000, decisions, confirmed: false, at: at(8) }))).toMatchObject({ ok: false, error: { code: "NEEDS_CONFIRMATION" } });
    const incomplete = Object.fromEntries(Object.entries(decisions).filter(([id]) => id !== s.emptyWalkIn.id));
    expect(await run(w.owner, (tx) => closeDayCmd(tx, w.owner, { countedCash: 10000, decisions: incomplete, confirmed: true, at: at(8) }))).toMatchObject({ ok: false, error: { code: "NEEDS_CONFIRMATION" } });
    expect(await db.as(w.owner, (tx) => getOpenRegister(tx))).not.toBeNull();

    const result = unwrap(await run(w.owner, (tx) => closeDayCmd(tx, w.owner, { countedCash: 10000, leftInDrawer: 4000, decisions, confirmed: true, at: at(8) })));
    expect(result.register).toMatchObject({ status: "closed", difference: 0, leftInDrawer: 4000 });

    const status = async (id: string) => (await rows("SELECT status, pending_since FROM comandas WHERE id = $1", [id]))[0];
    expect(await status(s.walkInUnpaid.id)).toEqual({ status: "open", pending_since: at(8) });
    expect((await status(s.emptyWalkIn.id)).status).toBe("discarded");
    expect((await status(s.apptUnpaid.id)).status).toBe("no_show");
    expect((await status(s.apptEmpty.id)).status).toBe("no_show");
    expect((await status(s.tomorrow.id)).status).toBe("open"); // not part of today
    expect(await rows("SELECT 1 FROM comandas WHERE barbershop_id = $1 AND status = 'cancelled'", [w.shop.id])).toEqual([]); // no-show is NOT a cancellation
    const registered = await db.adminPool.query("SELECT status, counted_cash_cents, left_in_drawer_cents FROM cash_registers WHERE id = $1", [result.register.id]);
    expect(registered.rows[0]).toEqual({ status: "closed", counted_cash_cents: 10000, left_in_drawer_cents: 4000 });
    const audit = await db.as(w.owner, (tx) => listAudit(tx, { limit: 50 }));
    const pending = audit.find((a) => a.action === "cash.closed_with_pending");
    expect(pending?.details).toEqual({ count: 1, total: 4500 });
    expect(audit.filter((a) => a.action === "comanda.no_show")).toHaveLength(3); // 2 now + the one the barber marked earlier

    // next morning: the opening cash is compared with what was left (R-CSH-07)
    const { openRegisterCmd } = await import("@/modules/finance/data/commands");
    const reopen = (cash: number, reason?: string) => run(w.rafael, (tx) => openRegisterCmd(tx, w.rafael, { openingCash: cash, reason, at: at(24) }));
    expect(await reopen(2000)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(unwrap(await reopen(2000, "Dono levou R$ 80 para o banco")).openingReason).toBe("Dono levou R$ 80 para o banco");
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "cash.opened_with_difference" }))).toHaveLength(1);
    expect(await db.as(w.owner, (tx) => getRegister(tx, result.register.id))).toMatchObject({ status: "closed" }); // yesterday stays sealed
  });
});

describe("pending comandas expire (R-CMD-22): the option of each barbershop", () => {
  async function pendingComanda(w: World, daysAgo: number): Promise<string> {
    if ((await rows("SELECT 1 FROM cash_registers WHERE barbershop_id = $1 AND status = 'open'", [w.shop.id])).length === 0) {
      await openCash(db, w.shop, 10000, w.owner, at(-30 * 24));
    }
    const c = unwrap(await run(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(-daysAgo * 24) })));
    unwrap(await service(w, w.rafael, c.id, "service", w.corte));
    await db.adminPool.query("UPDATE comandas SET pending_since = $2 WHERE id = $1", [c.id, at(-daysAgo * 24)]);
    return c.id;
  }
  const setSettings = (w: World, auto: boolean, days: number) =>
    db.adminPool.query("UPDATE barbershops SET auto_cancel_pending = $2, pending_expiry_days = $3 WHERE id = $1", [w.shop.id, auto, days]);

  it("after the deadline the SYSTEM cancels it, with a reason and an audit entry; before it, nothing happens", async () => {
    const w = await createWorld(db);
    const id = await pendingComanda(w, 5);
    const young = await pendingComanda(w, 2);
    expect(await runExpiryJob(db.appPool, at(0))).toMatchObject({ cancelled: 1 });
    const old = await db.as(w.owner, (tx) => getComanda(tx, id));
    expect(old).toMatchObject({ status: "cancelled", pendingSince: null, cancellation: { by: "system" } });
    expect(old?.cancellation?.reason).toContain("5 dias");
    expect((await db.as(w.owner, (tx) => getComanda(tx, young)))?.status).toBe("open");
    const audit = await db.as(w.owner, (tx) => listAudit(tx, { action: "comanda.expired" }));
    expect(audit).toHaveLength(1);
    expect(audit[0].userId).toBe("system");
    expect(await runExpiryJob(db.appPool, at(0))).toMatchObject({ cancelled: 0 }); // running again changes nothing
  });

  it("each barbershop has ITS OWN deadline, and a shop that turned the option OFF is never touched", async () => {
    const short = await createWorld(db, "Barbearia Prazo Curto");
    const long = await createWorld(db, "Barbearia Prazo Longo");
    const off = await createWorld(db, "Barbearia Sem Cancelar");
    const a = await pendingComanda(short, 4);
    const b = await pendingComanda(long, 4);
    const c = await pendingComanda(off, 400);
    await setSettings(short, true, 3); // 4 days old, deadline 3 → cancelled
    await setSettings(long, true, 10); // 4 days old, deadline 10 → stays
    await setSettings(off, false, 5); // option off → stays, even after 400 days
    await runExpiryJob(db.appPool, at(0));
    expect((await db.as(short.owner, (tx) => getComanda(tx, a)))?.status).toBe("cancelled");
    expect((await db.as(long.owner, (tx) => getComanda(tx, b)))?.status).toBe("open");
    expect((await db.as(off.owner, (tx) => getComanda(tx, c)))?.status).toBe("open");
    expect(await db.as(off.owner, (tx) => listAudit(tx, { action: "comanda.expired" }))).toEqual([]);
  });
});

describe("one barbershop can never act on another's comandas", () => {
  it("every command answers 'not found' for a comanda of another barbershop, and changes nothing", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    await openCash(db, a.shop);
    const c = unwrap(await run(a.rafael, (tx) => openComandaCmd(tx, a.rafael, { at: at(0) })));
    unwrap(await service(a, a.rafael, c.id, "service", a.corte));
    const notFound = { ok: false, error: { code: "WRONG_TENANT" } };
    expect(await run(b.owner, (tx) => closeComandaCmd(tx, b.owner, c.id, { method: "pix" }))).toMatchObject(notFound);
    expect(await run(b.owner, (tx) => cancelComandaCmd(tx, b.owner, c.id, { reason: "Intruso aqui" }))).toMatchObject(notFound);
    expect(await run(b.owner, (tx) => applyDiscountCmd(tx, b.owner, c.id, 100))).toMatchObject(notFound);
    expect(await run(b.owner, (tx) => setNoteCmd(tx, b.owner, c.id, "hacked"))).toMatchObject(notFound);
    expect(await run(b.owner, (tx) => discardComandaCmd(tx, b.owner, c.id))).toMatchObject(notFound);
    expect(await service(b, b.owner, c.id, "service", b.corte)).toMatchObject(notFound);
    // B cannot open a comanda for A's client, nor use A's service
    expect(await run(b.owner, (tx) => openComandaCmd(tx, b.owner, { clientId: a.marcos }))).toMatchObject({ ok: false });
    const own = unwrap(await run(b.owner, (tx) => openComandaCmd(tx, b.owner, { at: at(0) })));
    expect(await service(b, b.owner, own.id, "service", a.corte)).toMatchObject(notFound);
    // A's comanda is exactly as it was
    expect(await db.as(a.owner, (tx) => getComanda(tx, c.id))).toMatchObject({ status: "open", note: null, discount: null });
    expect((await db.as(b.owner, (tx) => listComandas(tx))).map((x) => x.id)).toEqual([own.id]);
  });

  it("the database refuses even a direct attempt to link A's data to B's", async () => {
    const a = await createWorld(db, "Barbearia A2");
    const b = await createWorld(db, "Barbearia B2");
    await expectPgError(
      db.adminPool.query(`INSERT INTO comandas (barbershop_id, number, client_id, opened_by, opened_at, status) VALUES ($1, 1, $2, $3, $4, 'open')`, [b.shop.id, a.marcos, b.owner.userId, T0]),
      PG.foreignKeyViolation,
    );
  });
});

describe("timing", () => {
  it("HOUR constant sanity (guards the helpers used above)", () => {
    expect(HOUR).toBe(3_600_000);
    expect(at(1).getTime() - at(0).getTime()).toBe(HOUR);
  });

  it("the job needs no owner connection, and forgets only old idempotency keys", async () => {
    const w = await createWorld(db, "Barbearia Chaves");
    await db.adminPool.query(
      `INSERT INTO idempotency_keys (barbershop_id, key, action, created_at) VALUES ($1, 'chave-velha-001', 'x', $2), ($1, 'chave-nova-0001', 'x', $3)`,
      [w.shop.id, new Date(at(0).getTime() - 40 * 24 * HOUR), new Date(at(0).getTime() - 2 * 24 * HOUR)],
    );
    expect(await forgetOldKeys(db.appPool, at(0))).toBe(1);
    const left = await db.adminPool.query("SELECT key FROM idempotency_keys WHERE barbershop_id = $1", [w.shop.id]);
    expect(left.rows.map((r) => r.key)).toEqual(["chave-nova-0001"]);
    // and the functions are not open to anybody else: the application role is the only one allowed
    await expectPgError(db.appPool.query("DELETE FROM idempotency_keys"), PG.insufficientPrivilege);
  });
});
