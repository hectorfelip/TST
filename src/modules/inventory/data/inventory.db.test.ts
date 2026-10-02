import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { withTenant } from "@/db/client";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { at, createWorld } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { adjustStockCmd, createProductCmd, recordPurchaseCmd, recordStockOutCmd } from "./commands";
import { getProduct, listProducts, listStockMovements, lockProducts } from "./inventory.repo";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("stock is the SUM of its movements (R-STK-01..06)", () => {
  it("a new product starts at 0; purchases, losses and adjustments change it; every change is a movement", async () => {
    const w = await createWorld(db);
    const gel = unwrap(await db.as(w.owner, (tx) => createProductCmd(tx, w.owner, { name: "Gel", use: "sale", salePrice: 2500, minStock: 3 })));
    expect(gel.stock).toBe(0);
    unwrap(await db.as(w.owner, (tx) => recordPurchaseCmd(tx, w.owner, gel.id, 10, at(0))));
    unwrap(await db.as(w.owner, (tx) => recordStockOutCmd(tx, w.owner, gel.id, "loss", 2, "Frasco quebrado", at(1))));
    const adjusted = unwrap(await db.as(w.owner, (tx) => adjustStockCmd(tx, w.owner, gel.id, 5, "Contagem mensal", at(2))));
    expect(adjusted.movement).toMatchObject({ type: "adjustment", quantity: -3 });
    expect((await db.as(w.owner, (tx) => getProduct(tx, gel.id)))?.stock).toBe(5);
    const history = await db.as(w.owner, (tx) => listStockMovements(tx, gel.id));
    expect(history.map((m) => [m.type, m.quantity])).toEqual([["purchase", 10], ["loss", -2], ["adjustment", -3]]);
    expect(history.reduce((sum, m) => sum + m.quantity, 0)).toBe(5); // stock == sum of the history
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "stock.adjusted" }))).toHaveLength(1);
  });

  it("only the owner manages stock; a reason is required for losses and adjustments; the other barbershop cannot touch it", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    expect(await db.as(a.rafael, (tx) => recordPurchaseCmd(tx, a.rafael, a.pomada, 5))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.as(a.owner, (tx) => recordStockOutCmd(tx, a.owner, a.pomada, "loss", 1, ""))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await db.as(b.owner, (tx) => recordPurchaseCmd(tx, b.owner, a.pomada, 5))).toMatchObject({ ok: false, error: { code: "WRONG_TENANT" } });
    expect((await db.as(a.owner, (tx) => getProduct(tx, a.pomada)))?.stock).toBe(2);
    expect((await db.as(b.owner, (tx) => listProducts(tx))).every((p) => p.barbershopId === b.shop.id)).toBe(true);
  });

  it("15 purchases at the same time: no purchase is lost (the stock is the sum, not a number somebody overwrites)", async () => {
    const w = await createWorld(db);
    await Promise.all(Array.from({ length: 15 }, () => db.as(w.owner, (tx) => recordPurchaseCmd(tx, w.owner, w.pomada, 1))));
    expect((await db.as(w.owner, (tx) => getProduct(tx, w.pomada)))?.stock).toBe(2 + 15);
  });

  it("an adjustment WAITS for a sale that has the product locked (so it never counts on an old stock)", async () => {
    const w = await createWorld(db);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let holding!: () => void;
    const holdingStarted = new Promise<void>((resolve) => (holding = resolve));
    // a "sale in progress": holds a shared lock on the product until we let it go
    const sale = withTenant(db.appPool, w.rafael, async (tx) => {
      await lockProducts(tx, [w.pomada], "share");
      holding();
      await gate;
    });
    await holdingStarted;
    let adjusted = false;
    const adjust = db.as(w.owner, (tx) => adjustStockCmd(tx, w.owner, w.pomada, 7, "Contagem mensal", at(1))).then((r) => {
      adjusted = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(adjusted).toBe(false); // still waiting
    release();
    await sale;
    expect(unwrap(await adjust).product.stock).toBe(7);
  });
});
