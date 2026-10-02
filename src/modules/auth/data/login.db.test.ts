/**
 * Login, sessions, password changes and idempotency, against a real PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setPasswordAsAdmin } from "@/db/admin";
import { withPublic } from "@/db/client";
import { runOnce } from "@/db/idempotency";
import { recordExpenseCmd } from "@/modules/finance/data/commands";
import { addBarber, createShop, createTestDb, expectPgError, PG, type Shop, type TestDb } from "@/test/db/helpers";
import { at, openCash } from "@/test/db/world";
import { setPasswordCmd } from "./credentials";
import { authenticate, LOGIN_FAILED_MESSAGE, lookupSessionUser } from "./login";
import { unwrap } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";

let db: TestDb;
let a: Shop;
let b: Shop;
let rafael: TenantContext;
const PASSWORD = "cadeira-azul-77";
const login = (email: string, password: string, now = at(0)) => withPublic(db.appPool, (tx) => authenticate(tx, email, password, now));
const emailOf = async (ctx: TenantContext) => (await db.adminPool.query("SELECT email FROM employees WHERE id = $1", [ctx.userId])).rows[0].email as string;

beforeAll(async () => {
  db = await createTestDb();
  a = await createShop(db, "Barbearia A", "dono-a@x.com");
  b = await createShop(db, "Barbearia B", "dono-b@x.com");
  rafael = await addBarber(db, a, "rafael", "rafael-a@x.com");
  await setPasswordAsAdmin(db.adminPool, a.ownerId, PASSWORD); // the first password of a person comes from the admin
  unwrap(await db.as(a.owner, (tx) => setPasswordCmd(tx, a.owner, { employeeId: rafael.userId, password: "rafael-senha-1" })));
});

afterAll(async () => {
  await db.close();
});

describe("login", () => {
  it("the right e-mail and password identify the person (e-mail is not case sensitive)", async () => {
    const r = unwrap(await login("  Dono-A@X.com ", PASSWORD));
    expect(r).toEqual({ employeeId: a.ownerId, barbershopId: a.id });
  });

  it("every failure gives the SAME message: wrong password, unknown e-mail, no password yet, inactive", async () => {
    await addBarber(db, a, "semsenha", "semsenha@x.com");
    const inactive = await addBarber(db, a, "inativo", "inativo@x.com");
    unwrap(await db.as(a.owner, (tx) => setPasswordCmd(tx, a.owner, { employeeId: inactive.userId, password: "inativo-senha-1" })));
    await db.adminPool.query("UPDATE employees SET active = false WHERE id = $1", [inactive.userId]);
    const attempts = [
      await login("dono-a@x.com", "senha-errada-1"),
      await login("ninguem@x.com", PASSWORD),
      await login("semsenha@x.com", PASSWORD),
      await login("inativo@x.com", "inativo-senha-1"),
    ];
    for (const r of attempts) expect(r).toEqual({ ok: false, error: { code: "NOT_ALLOWED", message: LOGIN_FAILED_MESSAGE } });
  });

  it("5 wrong passwords lock the person for 15 minutes, even for the right password", async () => {
    const email = await emailOf(rafael);
    for (let i = 0; i < 5; i++) await login(email, "errada-" + i, at(0));
    expect((await login(email, "rafael-senha-1", at(0.1))).ok).toBe(false); // 6 minutes later: still locked
    expect((await login(email, "rafael-senha-1", at(0.2))).ok).toBe(false); // 12 minutes later
    expect((await login(email, "rafael-senha-1", at(0.3))).ok).toBe(true); // 18 minutes later
  });

  it("after a lock ends, ONE more mistake does not lock again at once; a success clears the counter", async () => {
    const email = await emailOf(rafael);
    await login(email, "errada-x", at(1)); // counting starts again from 1
    expect((await login(email, "rafael-senha-1", at(1.01))).ok).toBe(true);
    const { rows } = await db.adminPool.query("SELECT failed_attempts, locked_until FROM employee_credentials WHERE employee_id = $1", [rafael.userId]);
    expect(rows[0]).toEqual({ failed_attempts: 0, locked_until: null });
  });

  it("the lock of one person does not affect another", async () => {
    expect((await login("dono-a@x.com", PASSWORD, at(0.01))).ok).toBe(true);
  });
});

describe("the session is checked against the database", () => {
  it("returns the CURRENT role and name; an inactive person has no session", async () => {
    const user = await withPublic(db.appPool, (tx) => lookupSessionUser(tx, rafael.userId));
    expect(user).toMatchObject({ employeeId: rafael.userId, barbershopId: a.id, role: "barber", name: "Barbeiro rafael" });
    await db.adminPool.query("UPDATE employees SET role = 'owner' WHERE id = $1", [rafael.userId]);
    expect((await withPublic(db.appPool, (tx) => lookupSessionUser(tx, rafael.userId)))?.role).toBe("owner");
    await db.adminPool.query("UPDATE employees SET role = 'barber', active = false WHERE id = $1", [rafael.userId]);
    expect(await withPublic(db.appPool, (tx) => lookupSessionUser(tx, rafael.userId))).toBeNull();
    await db.adminPool.query("UPDATE employees SET active = true WHERE id = $1", [rafael.userId]);
  });

  it("an unknown id has no session", async () => {
    expect(await withPublic(db.appPool, (tx) => lookupSessionUser(tx, "00000000-0000-4000-8000-000000000000"))).toBeNull();
  });
});

describe("changing passwords", () => {
  it("the application role cannot read or write the credentials table, whatever the barbershop", async () => {
    await expectPgError(db.as(a.owner, (tx) => tx.query("SELECT * FROM employee_credentials")), PG.insufficientPrivilege);
    await expectPgError(db.as(a.owner, (tx) => tx.query("UPDATE employee_credentials SET failed_attempts = 0")), PG.insufficientPrivilege);
    await expectPgError(db.as(a.owner, (tx) => tx.query("DELETE FROM employee_credentials")), PG.insufficientPrivilege);
  });

  it("the stored text is a salted hash, never the password", async () => {
    const { rows } = await db.adminPool.query("SELECT password_hash FROM employee_credentials");
    for (const r of rows) {
      expect(r.password_hash).toMatch(/^scrypt\$16384\$8\$5\$/);
      expect(r.password_hash).not.toContain("cadeira");
    }
    expect(new Set(rows.map((r) => r.password_hash)).size).toBe(rows.length);
  });

  it("the owner resets anybody's password without knowing the old one, and the old one stops working", async () => {
    unwrap(await db.as(a.owner, (tx) => setPasswordCmd(tx, a.owner, { employeeId: rafael.userId, password: "rafael-nova-2" })));
    expect((await login("rafael-a@x.com", "rafael-senha-1", at(5))).ok).toBe(false);
    expect((await login("rafael-a@x.com", "rafael-nova-2", at(5))).ok).toBe(true);
  });

  it("a barber cannot set another person's password; the owner of another barbershop cannot either", async () => {
    const barber = await db.as(rafael, (tx) => setPasswordCmd(tx, rafael, { employeeId: a.ownerId, password: "invasor-123" }));
    expect(barber).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const other = await db.as(b.owner, (tx) => setPasswordCmd(tx, b.owner, { employeeId: rafael.userId, password: "invasor-123" }));
    expect(other).toMatchObject({ ok: false, error: { code: "WRONG_TENANT" } });
    expect((await login("rafael-a@x.com", "rafael-nova-2", at(5))).ok).toBe(true);
  });

  it("changing your OWN password needs the current one", async () => {
    const missing = await db.as(rafael, (tx) => setPasswordCmd(tx, rafael, { employeeId: rafael.userId, password: "rafael-novissima-3" }));
    expect(missing).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    const wrong = await db.as(rafael, (tx) => setPasswordCmd(tx, rafael, { employeeId: rafael.userId, password: "rafael-novissima-3", currentPassword: "chute-errado" }));
    expect(wrong).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    unwrap(await db.as(rafael, (tx) => setPasswordCmd(tx, rafael, { employeeId: rafael.userId, password: "rafael-novissima-3", currentPassword: "rafael-nova-2" })));
    expect((await login("rafael-a@x.com", "rafael-novissima-3", at(6))).ok).toBe(true);
  });

  it("weak passwords are refused", async () => {
    for (const weak of ["curta", "12345678", "aaaaaaaaaa", "x".repeat(200)]) {
      const r = await db.as(a.owner, (tx) => setPasswordCmd(tx, a.owner, { employeeId: rafael.userId, password: weak }));
      expect(r, weak).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
  });

  it("a new password moves 'password_changed_at' forward (old sessions are refused by the server) and is audited", async () => {
    const before = await withPublic(db.appPool, (tx) => lookupSessionUser(tx, rafael.userId));
    unwrap(await db.as(a.owner, (tx) => setPasswordCmd(tx, a.owner, { employeeId: rafael.userId, password: "rafael-quarta-4", at: at(8) })));
    const after = await withPublic(db.appPool, (tx) => lookupSessionUser(tx, rafael.userId));
    expect(after!.passwordChangedAt.getTime()).toBeGreaterThan(before!.passwordChangedAt.getTime());
    const audit = await db.adminPool.query("SELECT details FROM audit_log WHERE action = 'employee.password_set' AND entity_id = $1 ORDER BY id DESC LIMIT 1", [rafael.userId]);
    expect(audit.rows[0].details).toEqual({ self: 0 });
  });

  it("a password change that fails later in the same transaction is rolled back", async () => {
    await expect(
      db.as(a.owner, async (tx) => {
        unwrap(await setPasswordCmd(tx, a.owner, { employeeId: rafael.userId, password: "rafael-quinta-5" }));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await login("rafael-a@x.com", "rafael-quinta-5", at(9))).ok).toBe(false);
    expect((await login("rafael-a@x.com", "rafael-quarta-4", at(9))).ok).toBe(true);
  });
});

describe("idempotency: the same request twice has its effect once", () => {
  const expense = (ctx: TenantContext, key: string | null, amount = 1850) =>
    db.as(ctx, (tx) => runOnce(tx, ctx, key, "expense", () => recordExpenseCmd(tx, ctx, { amount, method: "cash", description: "Café e açúcar" })));
  const expensesOf = async (shop: Shop) => (await db.adminPool.query("SELECT count(*)::int AS n FROM cash_movements WHERE barbershop_id = $1 AND type = 'expense'", [shop.id])).rows[0].n as number;

  beforeAll(async () => {
    await openCash(db, a);
    await openCash(db, b);
  });

  it("the second request with the same key is recognised and does nothing", async () => {
    expect(unwrap(await expense(a.owner, "key-aaaa-0001")).replayed).toBe(false);
    expect(unwrap(await expense(a.owner, "key-aaaa-0001")).replayed).toBe(true);
    expect(await expensesOf(a)).toBe(1);
  });

  it("a replay gives back what the first run returned (e.g. the id of the new thing)", async () => {
    const make = () => db.as(a.owner, (tx) => runOnce(tx, a.owner, "key-value-01", "make", async () => ({ ok: true as const, value: { id: "abc-123", n: 7 } })));
    expect(unwrap(await make())).toEqual({ replayed: false, value: { id: "abc-123", n: 7 } });
    expect(unwrap(await make())).toEqual({ replayed: true, value: { id: "abc-123", n: 7 } });
  });

  it("a new key is a new request", async () => {
    unwrap(await expense(a.owner, "key-aaaa-0002"));
    expect(await expensesOf(a)).toBe(2);
  });

  it("two identical requests at the SAME instant: exactly one effect", async () => {
    const results = await Promise.all([expense(a.owner, "key-race-0001"), expense(a.owner, "key-race-0001"), expense(a.owner, "key-race-0001")]);
    expect(results.map((r) => unwrap(r).replayed).sort()).toEqual([false, true, true]);
    expect(await expensesOf(a)).toBe(3);
  });

  it("a request that FAILS does not use up its key: fix the problem and send again", async () => {
    const refused = await expense(a.owner, "key-fail-0001", 0);
    expect(refused.ok).toBe(false);
    unwrap(await expense(a.owner, "key-fail-0001", 500));
    expect(await expensesOf(a)).toBe(4);
  });

  it("the same key in ANOTHER barbershop is independent", async () => {
    unwrap(await expense(b.owner, "key-aaaa-0001"));
    expect(await expensesOf(b)).toBe(1);
  });

  it("a key cannot be reused for a different action; a missing or silly key is refused", async () => {
    const other = await db.as(a.owner, (tx) => runOnce(tx, a.owner, "key-aaaa-0001", "withdrawal", async () => ({ ok: true as const, value: 1 })));
    expect(other).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await expense(a.owner, null)).toMatchObject({ ok: false });
    expect(await expense(a.owner, "x")).toMatchObject({ ok: false });
  });

  it("the application cannot change or delete saved keys", async () => {
    await expectPgError(db.as(a.owner, (tx) => tx.query("DELETE FROM idempotency_keys")), PG.insufficientPrivilege);
    await expectPgError(db.as(a.owner, (tx) => tx.query("UPDATE idempotency_keys SET action = 'x'")), PG.insufficientPrivilege);
  });

  it("a barbershop sees only its own keys", async () => {
    const rows = await db.as(b.owner, (tx) => tx.query<{ barbershop_id: string }>("SELECT barbershop_id FROM idempotency_keys"));
    expect(new Set(rows.map((r) => r.barbershop_id))).toEqual(new Set([b.id]));
  });
});

describe("atomically: a refusal halfway undoes everything the action wrote", () => {
  it("a discount saved before the payment is refused does NOT stay saved", async () => {
    const { atomically } = await import("@/db/atomic");
    const { addItemCmd, applyDiscountCmd, closeComandaCmd, openComandaCmd } = await import("@/modules/service-orders/data/commands");
    const { addService } = await import("@/test/db/helpers");
    const c = await createShop(db, "Barbearia C", "dono-c@x.com"); // no register was ever opened here
    const service = await addService(db, c, "Corte", 4500);
    const comanda = unwrap(await db.as(c.owner, (tx) => openComandaCmd(tx, c.owner, { at: at(0) })));
    unwrap(await db.as(c.owner, (tx) => addItemCmd(tx, c.owner, comanda.id, { kind: "service", refId: service, quantity: 1, barberId: c.ownerId, at: at(0) })));
    const result = await atomically(db.appPool, c.owner, undefined, async (tx) => {
      unwrap(await applyDiscountCmd(tx, c.owner, comanda.id, 500, at(1))); // saved...
      return closeComandaCmd(tx, c.owner, comanda.id, { method: "pix", at: at(1) }); // ...then refused: no open register
    });
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    const { rows } = await db.adminPool.query("SELECT discount_cents, status FROM comandas WHERE id = $1", [comanda.id]);
    expect(rows[0]).toEqual({ discount_cents: null, status: "open" });
  });

  it("success commits, and an unexpected error rolls back and is rethrown", async () => {
    const { atomically } = await import("@/db/atomic");
    const ok = await atomically(db.appPool, a.owner, { key: "key-atomic-01", action: "x" }, async () => ({ ok: true as const, value: { id: "z" } }));
    expect(ok).toEqual({ ok: true, value: { value: { id: "z" }, replayed: false } });
    await expect(
      atomically(db.appPool, a.owner, undefined, async () => {
        throw new Error("disk on fire");
      }),
    ).rejects.toThrow("disk on fire");
  });
});
