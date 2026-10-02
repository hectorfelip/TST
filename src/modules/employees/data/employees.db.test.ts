import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { createWorld } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { changeRoleCmd, createEmployeeCmd, setEmployeeActiveCmd } from "./commands";
import { listEmployees } from "./employees.repo";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("team (R-EMP-01..03)", () => {
  it("the owner adds a barber; an e-mail used in ANY barbershop (any case) is refused; a barber cannot add people", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    const bruno = unwrap(await db.as(a.owner, (tx) => createEmployeeCmd(tx, a.owner, { name: "Bruno", email: " Bruno@Barbearia.com ", role: "barber" })));
    expect(bruno.email).toBe("bruno@barbearia.com");
    expect(await db.as(b.owner, (tx) => createEmployeeCmd(tx, b.owner, { name: "Outro Bruno", email: "BRUNO@barbearia.com", role: "barber" }))).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(await db.as(a.rafael, (tx) => createEmployeeCmd(tx, a.rafael, { name: "Intruso", email: "intruso@x.com", role: "barber" }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    // the login lookup finds him in the right barbershop, without being logged in
    const { rows } = await db.appPool.query("SELECT barbershop_id, role FROM auth_lookup('bruno@barbearia.com')");
    expect(rows).toEqual([{ barbershop_id: a.shop.id, role: "barber" }]);
  });

  it("two people adding the same e-mail at once: one succeeds, the other gets a normal refusal", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    const add = (w: typeof a) => db.as(w.owner, (tx) => createEmployeeCmd(tx, w.owner, { name: "Corrida", email: "corrida@x.com", role: "barber" }));
    const results = await Promise.all([add(a), add(b)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "NOT_ALLOWED" } });
  });

  it("R-EMP-02: the last active owner cannot be demoted or deactivated", async () => {
    const w = await createWorld(db);
    expect(await db.as(w.owner, (tx) => changeRoleCmd(tx, w.owner, w.owner.userId, "barber"))).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(await db.as(w.owner, (tx) => setEmployeeActiveCmd(tx, w.owner, w.owner.userId, false))).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect((await db.as(w.owner, (tx) => listEmployees(tx))).filter((e) => e.role === "owner" && e.active)).toHaveLength(1);
  });

  it("two owners demoting EACH OTHER at the same time: exactly one succeeds, somebody is always in charge", async () => {
    const w = await createWorld(db);
    const second = unwrap(await db.as(w.owner, (tx) => createEmployeeCmd(tx, w.owner, { name: "Segundo Dono", email: "segundo@x.com", role: "owner" })));
    const other = { barbershopId: w.shop.id, userId: second.id, role: "owner" as const };
    const results = await Promise.all([
      db.as(w.owner, (tx) => changeRoleCmd(tx, w.owner, second.id, "barber")),
      db.as(other, (tx) => changeRoleCmd(tx, other, w.owner.userId, "barber")),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.as(w.owner, (tx) => listEmployees(tx))).filter((e) => e.role === "owner" && e.active)).toHaveLength(1);
  });

  it("people are deactivated, never deleted; role changes and deactivations are audited", async () => {
    const w = await createWorld(db);
    unwrap(await db.as(w.owner, (tx) => setEmployeeActiveCmd(tx, w.owner, w.diego.userId, false)));
    unwrap(await db.as(w.owner, (tx) => changeRoleCmd(tx, w.owner, w.rafael.userId, "owner")));
    expect((await db.as(w.owner, (tx) => listEmployees(tx))).find((e) => e.id === w.diego.userId)).toMatchObject({ active: false });
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "employee.deactivated" }))).toHaveLength(1);
    expect(await db.as(w.owner, (tx) => listAudit(tx, { action: "employee.role_changed" }))).toHaveLength(1);
  });

  it("each barbershop sees only its own team", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    const team = await db.as(a.owner, (tx) => listEmployees(tx));
    expect(new Set(team.map((e) => e.barbershopId))).toEqual(new Set([a.shop.id]));
    expect(team).toHaveLength(3);
    expect(await db.as(a.owner, (tx) => changeRoleCmd(tx, a.owner, b.rafael.userId, "owner"))).toMatchObject({ ok: false, error: { code: "WRONG_TENANT" } });
  });
});
