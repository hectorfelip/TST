import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { createTestDb, withSlowWrites, type TestDb } from "@/test/db/helpers";
import { at, createWorld, openCash } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { getOpenRegisterReport, openRegisterCmd, recordExpenseCmd, recordWithdrawalCmd } from "./commands";
import { getLastClosedRegister, getOpenRegister } from "./registers.repo";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("cash register (R-CSH-01..07)", () => {
  it("a barber opens it, and it records who; the first register has nothing to compare with", async () => {
    const w = await createWorld(db);
    const register = await openCash(db, w.shop, 10000, w.rafael);
    expect(register).toMatchObject({ status: "open", openedBy: w.rafael.userId, openingCash: 10000 });
    expect(await db.as(w.owner, (tx) => getLastClosedRegister(tx))).toBeNull();
  });

  it("expenses and withdrawals: owner only; every movement is saved, the report is derived (cash ignores Pix)", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    expect(await db.as(w.rafael, (tx) => recordExpenseCmd(tx, w.rafael, { amount: 1850, method: "cash", description: "café" }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    unwrap(await db.as(w.owner, (tx) => recordExpenseCmd(tx, w.owner, { amount: 1850, method: "cash", description: "café e açúcar", at: at(1) })));
    unwrap(await db.as(w.owner, (tx) => recordExpenseCmd(tx, w.owner, { amount: 5000, method: "pix", description: "fornecedor", at: at(1) })));
    unwrap(await db.as(w.owner, (tx) => recordWithdrawalCmd(tx, w.owner, { amount: 3000, reason: "Depósito no banco", at: at(2) })));
    const report = await db.as(w.owner, (tx) => getOpenRegisterReport(tx));
    expect(report?.expectedCash).toBe(10000 - 1850 - 3000); // the Pix expense never leaves the drawer
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "cash.withdrawal" }))).toHaveLength(1);
  });

  it("two withdrawals at once cannot together take more cash than the drawer has", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const withdraw = () => db.as(w.owner, (tx) => recordWithdrawalCmd(tx, w.owner, { amount: 7000, reason: "Depósito no banco", at: at(1) }));
    // the first withdrawal is "in the middle" of being saved when the second one arrives
    const results = await withSlowWrites(db, "cash_movements", "NEW.type = 'withdrawal'", 0.4, () => Promise.all([withdraw(), withdraw()]));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "NOT_ALLOWED" } });
    expect((await db.as(w.owner, (tx) => getOpenRegisterReport(tx)))?.expectedCash).toBe(3000);
  });

  it("only one register is open at a time; the other barbershop's register is invisible", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    await openCash(db, a.shop);
    expect(await db.as(a.rafael, (tx) => openRegisterCmd(tx, a.rafael, { openingCash: 1 }))).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(await db.as(b.owner, (tx) => getOpenRegister(tx))).toBeNull();
    await openCash(db, b.shop); // B can open its own at the same time
    expect(await db.as(b.owner, (tx) => getOpenRegister(tx))).not.toBeNull();
  });
});
