import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { addItemCmd, closeComandaCmd, openComandaCmd } from "@/modules/service-orders/data/commands";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { at, createWorld, openCash } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { anonymizeClientCmd, clientViewCmd, createClientCmd, updateClientCmd } from "./commands";
import { findByPhone, getClient, lastVisitByClient } from "./clients.repo";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("clients (R-CLI-01..05)", () => {
  it("a barber registers a client; the phone is stored as digits; another barbershop can have the same phone", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    const created = unwrap(await db.as(a.rafael, (tx) => createClientCmd(tx, a.rafael, { name: "  Pedro   Alves ", phone: "(11) 96666-3333", notes: "", at: at(0) })));
    expect(created).toMatchObject({ name: "Pedro Alves", phone: "11966663333", notes: null });
    expect(await db.as(b.owner, (tx) => createClientCmd(tx, b.owner, { name: "Outro Pedro", phone: "11966663333", notes: "" }))).toMatchObject({ ok: true });
    expect(await db.as(a.owner, (tx) => findByPhone(tx, "11966663333"))).toMatchObject({ name: "Pedro Alves" }); // only A's
  });

  it("R-CLI-02: the same phone twice in one barbershop is refused, also when two people register it AT ONCE", async () => {
    const w = await createWorld(db);
    const again = await db.as(w.rafael, (tx) => createClientCmd(tx, w.rafael, { name: "Duplicado", phone: "11977772222", notes: "" })); // Marcos already has it
    expect(again).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    const race = await Promise.all([
      db.as(w.rafael, (tx) => createClientCmd(tx, w.rafael, { name: "Corrida Um", phone: "11955554444", notes: "" })),
      db.as(w.diego, (tx) => createClientCmd(tx, w.diego, { name: "Corrida Dois", phone: "11955554444", notes: "" })),
    ]);
    expect(race.filter((r) => r.ok)).toHaveLength(1);
    expect(race.find((r) => !r.ok)).toMatchObject({ error: { code: "NOT_ALLOWED" } }); // translated from the database refusal, not a crash
  });

  it("only the owner edits a client", async () => {
    const w = await createWorld(db);
    const input = { name: "Marcos L.", phone: "11977772222", notes: "Máquina 1" };
    expect(await db.as(w.rafael, (tx) => updateClientCmd(tx, w.rafael, w.marcos, input))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(unwrap(await db.as(w.owner, (tx) => updateClientCmd(tx, w.owner, w.marcos, input))).notes).toBe("Máquina 1");
  });

  it("R-CLI-04 (LGPD): erasing removes name, phone and notes, keeps the history, writes the audit entry and frees the phone", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const c = unwrap(await db.as(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { clientId: w.marcos, at: at(0) })));
    unwrap(await db.as(w.rafael, (tx) => addItemCmd(tx, w.rafael, c.id, { kind: "service", refId: w.corte, quantity: 1, barberId: w.rafael.userId })));
    unwrap(await db.as(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(1) })));
    expect(await db.as(w.rafael, (tx) => anonymizeClientCmd(tx, w.rafael, w.marcos))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    unwrap(await db.as(w.owner, (tx) => anonymizeClientCmd(tx, w.owner, w.marcos, at(2))));
    expect(await db.as(w.owner, (tx) => getClient(tx, w.marcos))).toMatchObject({ name: "Cliente removido", phone: null, notes: null, anonymizedAt: at(2) });
    expect((await db.adminPool.query("SELECT count(*)::int AS n FROM comandas WHERE client_id = $1 AND status = 'closed'", [w.marcos])).rows[0].n).toBe(1); // history stays
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "client.anonymized" }))).toHaveLength(1);
    expect(await db.as(w.owner, (tx) => createClientCmd(tx, w.owner, { name: "Novo Marcos", phone: "11977772222", notes: "" }))).toMatchObject({ ok: true }); // the phone is free again
  });

  it("decision B: the owner sees the phone and every visit; a barber sees NO phone and only HIS visits", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const visit = async (barber: typeof w.rafael, serviceId: string, hour: number) => {
      const c = unwrap(await db.as(barber, (tx) => openComandaCmd(tx, barber, { clientId: w.marcos, at: at(hour) })));
      unwrap(await db.as(barber, (tx) => addItemCmd(tx, barber, c.id, { kind: "service", refId: serviceId, quantity: 1, barberId: barber.userId, at: at(hour) })));
      unwrap(await db.as(barber, (tx) => closeComandaCmd(tx, barber, c.id, { method: "pix", at: at(hour + 0.5) })));
    };
    await visit(w.diego, w.corte, 1);
    await visit(w.rafael, w.barba, 2);
    const asOwner = unwrap(await db.as(w.owner, (tx) => clientViewCmd(tx, w.owner, w.marcos)));
    expect(asOwner.phone).toBe("11977772222");
    expect(asOwner.visits.map((v) => [v.description, v.amount])).toEqual([["Barba", 3500], ["Corte", 4500]]);
    const asRafael = unwrap(await db.as(w.rafael, (tx) => clientViewCmd(tx, w.rafael, w.marcos)));
    expect(asRafael.phone).toBeNull();
    expect(asRafael.visits.map((v) => v.description)).toEqual(["Barba"]);
    expect(asRafael.lastVisitAt).toEqual(at(2.5)); // the date of the last visit is real, even if it was Diego's
  });

  it("last visit per client: the latest PAID comanda; clients without one are absent; other barbershops are invisible", async () => {
    const w = await createWorld(db);
    await openCash(db, w.shop);
    const visit = async (clientId: string, hour: number, pay: boolean) => {
      const c = unwrap(await db.as(w.rafael, (tx) => openComandaCmd(tx, w.rafael, { clientId, at: at(hour) })));
      unwrap(await db.as(w.rafael, (tx) => addItemCmd(tx, w.rafael, c.id, { kind: "service", refId: w.corte, quantity: 1, barberId: w.rafael.userId, at: at(hour) })));
      if (pay) unwrap(await db.as(w.rafael, (tx) => closeComandaCmd(tx, w.rafael, c.id, { method: "pix", at: at(hour + 0.5) })));
    };
    await visit(w.marcos, 1, true);
    await visit(w.marcos, 3, true);
    await visit(w.marcos, 5, false); // not paid: not a visit
    await visit(w.andre, 2, false);
    const other = await createWorld(db, "Barbearia Outra");
    const last = await db.as(w.owner, (tx) => lastVisitByClient(tx));
    expect([...last.entries()]).toEqual([[w.marcos, at(3.5)]]);
    expect((await db.as(other.owner, (tx) => lastVisitByClient(tx))).size).toBe(0);
  });

  it("another barbershop cannot see this client at all", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    expect(await db.as(b.owner, (tx) => clientViewCmd(tx, b.owner, a.marcos))).toMatchObject({ ok: false, error: { code: "WRONG_TENANT" } });
    expect(await db.as(b.owner, (tx) => getClient(tx, a.marcos))).toBeNull();
  });
});
