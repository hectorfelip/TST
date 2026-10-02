import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addItemCmd, openComandaCmd } from "@/modules/service-orders/data/commands";
import { getComanda } from "@/modules/service-orders/data/comandas.repo";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { at, createWorld } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { createServiceCmd, setServiceActiveCmd, updateServiceCmd } from "./commands";
import { getService, listServices } from "./services.repo";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("services (R-SRV-01..03)", () => {
  it("R-SRV-02: changing the price does NOT change comandas that already have the service", async () => {
    const w = await createWorld(db);
    const c = unwrap(await db.as(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    unwrap(await db.as(w.rafael, (tx) => addItemCmd(tx, w.rafael, c.id, { kind: "service", refId: w.corte, quantity: 1, barberId: w.rafael.userId })));
    unwrap(await db.as(w.owner, (tx) => updateServiceCmd(tx, w.owner, w.corte, { name: "Corte premium", price: 6000, durationMinutes: 30, favorite: true })));
    unwrap(await db.as(w.rafael, (tx) => addItemCmd(tx, w.rafael, c.id, { kind: "service", refId: w.corte, quantity: 1, barberId: w.rafael.userId })));
    const items = (await db.as(w.owner, (tx) => getComanda(tx, c.id)))?.items;
    expect(items?.map((i) => [i.name, i.unitPrice])).toEqual([["Corte", 4500], ["Corte premium", 6000]]);
  });

  it("only the owner manages services; a deactivated service leaves the favorites and cannot be sold; nothing is deleted", async () => {
    const w = await createWorld(db);
    expect(await db.as(w.rafael, (tx) => createServiceCmd(tx, w.rafael, { name: "Luzes", price: 12000, durationMinutes: 90, favorite: false }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const luzes = unwrap(await db.as(w.owner, (tx) => createServiceCmd(tx, w.owner, { name: "Luzes", price: 12000, durationMinutes: 90, favorite: true })));
    unwrap(await db.as(w.owner, (tx) => setServiceActiveCmd(tx, w.owner, luzes.id, false)));
    expect(await db.as(w.owner, (tx) => getService(tx, luzes.id))).toMatchObject({ active: false, favorite: false });
    const c = unwrap(await db.as(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { at: at(0) })));
    expect(await db.as(w.rafael, (tx) => addItemCmd(tx, w.rafael, c.id, { kind: "service", refId: luzes.id, quantity: 1, barberId: w.rafael.userId }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect((await db.as(w.owner, (tx) => listServices(tx))).map((s) => s.name)).toContain("Luzes");
  });

  it("another barbershop cannot read or change this catalog", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    expect(await db.as(b.owner, (tx) => updateServiceCmd(tx, b.owner, a.corte, { name: "Hack", price: 1, durationMinutes: 30, favorite: false }))).toMatchObject({ ok: false, error: { code: "WRONG_TENANT" } });
    expect((await db.as(b.owner, (tx) => listServices(tx))).every((s) => s.barbershopId === b.shop.id)).toBe(true);
    expect((await db.as(a.owner, (tx) => getService(tx, a.corte)))?.name).toBe("Corte");
  });
});
