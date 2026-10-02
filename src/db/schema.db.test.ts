/**
 * What the DATABASE guarantees, independently of the application code.
 * Each test tries to do something that must be impossible and checks that
 * PostgreSQL itself refuses it.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_URL, APP_PASSWORD, urlFor } from "@/test/db/config";
import {
  addBarber,
  addClient,
  addProduct,
  addPurchase,
  addService,
  createShop,
  createTestDb,
  expectPgError,
  id,
  PG,
  T0,
  type Shop,
  type TestDb,
} from "@/test/db/helpers";
import { createPool, assertSafeAppRole, withAdmin, withTenant } from "./client";
import { createBarbershopWithOwner } from "./admin";
import { migrate } from "./migrate";

let db: TestDb;
let a: Shop;
let b: Shop;
let aBarber: Awaited<ReturnType<typeof addBarber>>;
let aClient: string;
let bClient: string;
let aService: string;
let bService: string;
let aProduct: string;
let bProduct: string;
let aRegister: string;
let bRegister: string;
let aComanda: string;
let bComanda: string;

async function insertRegister(shop: Shop, status: "open" | "closed" = "open"): Promise<string> {
  const registerId = id();
  await db.adminPool.query(
    status === "open"
      ? `INSERT INTO cash_registers (id, barbershop_id, status, opened_at, opened_by, opening_cash_cents) VALUES ($1, $2, 'open', $3, $4, 10000)`
      : `INSERT INTO cash_registers (id, barbershop_id, status, opened_at, opened_by, opening_cash_cents, closed_at, closed_by, counted_cash_cents, difference_cents, left_in_drawer_cents)
         VALUES ($1, $2, 'closed', $3, $4, 10000, $3, $4, 10000, 0, 10000)`,
    [registerId, shop.id, T0, shop.ownerId],
  );
  return registerId;
}

let numberSeq = 100;
async function insertComanda(shop: Shop, extra: Record<string, unknown> = {}): Promise<string> {
  const comandaId = id();
  const row = { id: comandaId, barbershop_id: shop.id, number: ++numberSeq, opened_by: shop.ownerId, opened_at: T0, status: "open", ...extra };
  const keys = Object.keys(row);
  await db.adminPool.query(
    `INSERT INTO comandas (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(row),
  );
  return comandaId;
}

beforeAll(async () => {
  db = await createTestDb();
  a = await createShop(db, "Barbearia A", "dono-a@x.com");
  b = await createShop(db, "Barbearia B", "dono-b@x.com");
  aBarber = await addBarber(db, a, "rafael", "rafael-a@x.com");
  await addBarber(db, b, "diego", "diego-b@x.com");
  aClient = await addClient(db, a, "Cliente A", "11988881111");
  bClient = await addClient(db, b, "Cliente B", "11988881111"); // same phone, other barbershop: allowed
  aService = await addService(db, a, "Corte A");
  bService = await addService(db, b, "Corte B");
  aProduct = await addProduct(db, a, "Pomada A");
  bProduct = await addProduct(db, b, "Pomada B");
  await addPurchase(db, a, aProduct, 10);
  await addPurchase(db, b, bProduct, 7);
  aRegister = await insertRegister(a);
  bRegister = await insertRegister(b);
  aComanda = await insertComanda(a, { client_id: aClient });
  bComanda = await insertComanda(b, { client_id: bClient });
  await db.adminPool.query(
    `INSERT INTO comanda_items (barbershop_id, comanda_id, kind, service_id, name, unit_price_cents, quantity, barber_id, added_by, added_at)
     VALUES ($1, $2, 'service', $3, 'Corte A', 4500, 1, $4, $4, $5), ($6, $7, 'service', $8, 'Corte B', 4500, 1, $9, $9, $5)`,
    [a.id, aComanda, aService, a.ownerId, T0, b.id, bComanda, bService, b.ownerId],
  );
  await db.adminPool.query(
    `INSERT INTO cash_movements (barbershop_id, register_id, type, method, amount_cents, description, user_id, at)
     VALUES ($1, $2, 'opening', 'cash', 10000, 'Abertura', $3, $7), ($4, $5, 'opening', 'cash', 10000, 'Abertura', $6, $7)`,
    [a.id, aRegister, a.ownerId, b.id, bRegister, b.ownerId, T0],
  );
  await db.adminPool.query(
    `INSERT INTO audit_log (barbershop_id, action, user_id, at, entity_id) VALUES ($1, 'x', 'u', $3, 'e'), ($2, 'x', 'u', $3, 'e')`,
    [a.id, b.id, T0],
  );
  await db.adminPool.query(`INSERT INTO comanda_counters (barbershop_id, last_number) VALUES ($1, 5), ($2, 9)`, [a.id, b.id]);
});

afterAll(async () => {
  await db.close();
});

const TENANT_TABLES = [
  "employees",
  "services",
  "products",
  "clients",
  "cash_registers",
  "comandas",
  "comanda_items",
  "comanda_counters",
  "stock_movements",
  "cash_movements",
  "audit_log",
];

describe("tenant isolation (Row Level Security)", () => {
  it("with NO barbershop set, the application sees nothing at all", async () => {
    for (const table of [...TENANT_TABLES, "barbershops", "product_stock"]) {
      const { rows } = await db.appPool.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0].n, table).toBe(0);
    }
  });

  it("with barbershop A set, it sees ONLY A's rows in every table", async () => {
    for (const table of TENANT_TABLES) {
      const rows = await db.as(a.owner, (tx) => tx.query<{ barbershop_id: string }>(`SELECT barbershop_id FROM ${table}`));
      expect(rows.length, table).toBeGreaterThan(0);
      expect(new Set(rows.map((r) => r.barbershop_id)), table).toEqual(new Set([a.id]));
    }
    const shops = await db.as(a.owner, (tx) => tx.query<{ id: string }>("SELECT id FROM barbershops"));
    expect(shops.map((s) => s.id)).toEqual([a.id]);
  });

  it("A cannot read B's row even knowing its id", async () => {
    const byId = await db.as(a.owner, (tx) => tx.query("SELECT * FROM comandas WHERE id = $1", [bComanda]));
    expect(byId).toEqual([]);
    const client = await db.as(a.owner, (tx) => tx.query("SELECT * FROM clients WHERE id = $1", [bClient]));
    expect(client).toEqual([]);
  });

  it("A cannot UPDATE B's rows (0 rows affected) and B's data stays intact", async () => {
    await db.as(a.owner, async (tx) => {
      await tx.query("UPDATE clients SET name = 'HACKED' WHERE id = $1", [bClient]);
      await tx.query("UPDATE comandas SET note = 'HACKED' WHERE id = $1", [bComanda]);
      await tx.query("UPDATE employees SET active = false WHERE barbershop_id = $1", [b.id]);
      await tx.query("UPDATE barbershops SET name = 'HACKED' WHERE id = $1", [b.id]);
    });
    const { rows } = await db.adminPool.query("SELECT name FROM clients WHERE id = $1", [bClient]);
    expect(rows[0].name).toBe("Cliente B");
    const shop = await db.adminPool.query("SELECT name FROM barbershops WHERE id = $1", [b.id]);
    expect(shop.rows[0].name).toBe("Barbearia B");
  });

  it("A cannot INSERT a row that belongs to B (policy WITH CHECK)", async () => {
    await expectPgError(
      db.as(a.owner, (tx) => tx.query("INSERT INTO clients (barbershop_id, name) VALUES ($1, 'Intruso')", [b.id])),
      PG.insufficientPrivilege,
    );
    await expectPgError(
      db.as(a.owner, (tx) => tx.query("INSERT INTO audit_log (barbershop_id, action, user_id, at, entity_id) VALUES ($1, 'x', 'u', now(), 'e')", [b.id])),
      PG.insufficientPrivilege,
    );
  });

  it("A cannot MOVE its own row to B (UPDATE ... SET barbershop_id)", async () => {
    await expectPgError(
      db.as(a.owner, (tx) => tx.query("UPDATE clients SET barbershop_id = $1 WHERE id = $2", [b.id, aClient])),
      PG.insufficientPrivilege,
    );
  });

  it("the derived stock view also respects the barbershop", async () => {
    const rows = await db.as(a.owner, (tx) => tx.query<{ product_id: string; stock: number }>("SELECT product_id, stock FROM product_stock"));
    expect(rows).toEqual([{ product_id: aProduct, stock: 10 }]);
  });

  it("the barbershop is local to the transaction: it never leaks to the next user of the connection", async () => {
    const single = createPool(`${urlFor(db.name, "app_user", APP_PASSWORD)}`, { max: 1 }, () => undefined);
    try {
      const first = await withTenant(single, a.owner, (tx) => tx.query("SELECT id FROM comandas"));
      expect(first.length).toBeGreaterThan(0);
      const { rows } = await single.query("SELECT count(*)::int AS n FROM comandas"); // same connection, no tenant
      expect(rows[0].n).toBe(0);
    } finally {
      await single.end();
    }
  });

  it("withTenant refuses something that is not a barbershop id", () => {
    expect(() => withTenant(db.appPool, { barbershopId: "'; DROP TABLE comandas; --", userId: "x" }, async () => 1)).toThrow(/valid barbershop id/);
  });

  it("the application role is safe; the owner role is not accepted by assertSafeAppRole", async () => {
    await expect(assertSafeAppRole(db.appPool)).resolves.toBeUndefined();
    await expect(assertSafeAppRole(db.adminPool)).rejects.toThrow(/Unsafe database role/);
  });
});

describe("the application cannot delete, and history cannot be rewritten", () => {
  it("app_user cannot DELETE from any table", async () => {
    for (const table of [...TENANT_TABLES, "barbershops"]) {
      await expectPgError(db.as(a.owner, (tx) => tx.query(`DELETE FROM ${table}`)), PG.insufficientPrivilege);
    }
  });

  it("app_user cannot UPDATE the history tables", async () => {
    for (const table of ["stock_movements", "cash_movements", "audit_log"]) {
      await expectPgError(db.as(a.owner, (tx) => tx.query(`UPDATE ${table} SET at = now()`)), PG.insufficientPrivilege);
    }
  });

  it("not even the database OWNER (or a superuser) can change or delete history: triggers refuse", async () => {
    for (const table of ["stock_movements", "cash_movements", "audit_log"]) {
      await expectPgError(db.adminPool.query(`UPDATE ${table} SET at = now()`), PG.insufficientPrivilege);
      await expectPgError(db.adminPool.query(`DELETE FROM ${table}`), PG.insufficientPrivilege);
      await expectPgError(db.adminPool.query(`TRUNCATE ${table} CASCADE`), PG.insufficientPrivilege);
    }
  });

  it("app_user cannot create or drop anything", async () => {
    await expectPgError(db.appPool.query("CREATE TABLE hacked (x int)"), PG.insufficientPrivilege);
    await expectPgError(db.appPool.query("DROP TABLE comandas"), "42501");
  });

  it("app_user cannot read the migrations table", async () => {
    await expectPgError(db.appPool.query("SELECT * FROM schema_migrations"), PG.insufficientPrivilege);
  });
});

describe("a row can never point to a row of ANOTHER barbershop (composite foreign keys)", () => {
  // These run with the OWNER connection, which bypasses Row Level Security:
  // even a bug (or an admin script) cannot create a cross-tenant link.
  it("comanda → client of another barbershop", async () => {
    await expectPgError(insertComanda(a, { client_id: bClient }), PG.foreignKeyViolation);
  });

  it("comanda → employee of another barbershop", async () => {
    await expectPgError(insertComanda(a, { opened_by: b.ownerId }), PG.foreignKeyViolation);
  });

  it("comanda item → comanda, service or barber of another barbershop", async () => {
    const item = (comanda: string, service: string, barber: string) =>
      db.adminPool.query(
        `INSERT INTO comanda_items (barbershop_id, comanda_id, kind, service_id, name, unit_price_cents, quantity, barber_id, added_by, added_at)
         VALUES ($1, $2, 'service', $3, 'x', 100, 1, $4, $4, $5)`,
        [a.id, comanda, service, barber, T0],
      );
    await expectPgError(item(bComanda, aService, a.ownerId), PG.foreignKeyViolation);
    await expectPgError(item(aComanda, bService, a.ownerId), PG.foreignKeyViolation);
    await expectPgError(item(aComanda, aService, b.ownerId), PG.foreignKeyViolation);
  });

  it("stock movement → product of another barbershop", async () => {
    await expectPgError(
      db.adminPool.query(`INSERT INTO stock_movements (barbershop_id, product_id, type, quantity, at, user_id) VALUES ($1, $2, 'purchase', 1, $3, $4)`, [a.id, bProduct, T0, a.ownerId]),
      PG.foreignKeyViolation,
    );
  });

  it("cash movement → register of another barbershop", async () => {
    await expectPgError(
      db.adminPool.query(
        `INSERT INTO cash_movements (barbershop_id, register_id, type, method, amount_cents, description, user_id, at) VALUES ($1, $2, 'expense', 'cash', -100, 'x', $3, $4)`,
        [a.id, bRegister, a.ownerId, T0],
      ),
      PG.foreignKeyViolation,
    );
  });

  it("payment of a comanda → register of another barbershop", async () => {
    await expectPgError(
      insertComanda(a, {
        status: "closed",
        closed_at: T0,
        closed_by: a.ownerId,
        payment_method: "pix",
        payment_total_cents: 100,
        payment_register_id: bRegister,
      }),
      PG.foreignKeyViolation,
    );
  });
});

describe("uniqueness rules", () => {
  it("R-CMD: two comandas of a barbershop cannot have the same number; another barbershop can reuse it", async () => {
    const number = 9001;
    await insertComanda(a, { number });
    await expectPgError(insertComanda(a, { number }), PG.uniqueViolation);
    await insertComanda(b, { number });
  });

  it("R-CSH-01: only ONE open register per barbershop (even with two at once)", async () => {
    await expectPgError(insertRegister(a), PG.uniqueViolation);
    await insertRegister(a, "closed"); // closed ones are history: any number
    await insertRegister(a, "closed");
  });

  it("R-CLI-02: the same phone cannot belong to two clients of a barbershop; two clients can have none", async () => {
    await expectPgError(addClient(db, a, "Outro", "11988881111"), PG.uniqueViolation);
    await addClient(db, a, "Sem telefone 1", null);
    await addClient(db, a, "Sem telefone 2", null);
  });

  it("R-EMP-01: an e-mail is unique in the WHOLE system (it is the login) and must be lower case", async () => {
    await expectPgError(addBarber(db, b, "dup", "rafael-a@x.com"), PG.uniqueViolation);
    await expectPgError(addBarber(db, b, "caps", "Caps@X.com"), PG.checkViolation);
    await expectPgError(addBarber(db, b, "bad", "not-an-email"), PG.checkViolation);
  });
});

describe("values the rules would never produce are refused (CHECK constraints)", () => {
  const run = (sql: string, params: unknown[]) => db.adminPool.query(sql, params);

  it("money: services and products need a price above zero; internal products have none", async () => {
    await expectPgError(run("INSERT INTO services (barbershop_id, name, price_cents, duration_minutes) VALUES ($1, 'x1', 0, 30)", [a.id]), PG.checkViolation);
    await expectPgError(run("INSERT INTO services (barbershop_id, name, price_cents, duration_minutes) VALUES ($1, 'x2', -5, 30)", [a.id]), PG.checkViolation);
    await expectPgError(run("INSERT INTO services (barbershop_id, name, price_cents, duration_minutes) VALUES ($1, 'x3', 4500, 2)", [a.id]), PG.checkViolation);
    await expectPgError(run("INSERT INTO services (barbershop_id, name, price_cents, duration_minutes, favorite, active) VALUES ($1, 'x4', 100, 30, true, false)", [a.id]), PG.checkViolation);
    await expectPgError(run("INSERT INTO products (barbershop_id, name, use) VALUES ($1, 'x5', 'sale')", [a.id]), PG.checkViolation);
    await expectPgError(run("INSERT INTO products (barbershop_id, name, use, sale_price_cents) VALUES ($1, 'x6', 'internal', 100)", [a.id]), PG.checkViolation);
  });

  it("money has no decimals: a fractional amount sent by the application is rejected", async () => {
    // Sent as a parameter (as the application always does), 45.5 is not a valid integer.
    await expect(run("INSERT INTO services (barbershop_id, name, price_cents, duration_minutes) VALUES ($1, 'x7', $2, 30)", [a.id, 45.5])).rejects.toThrow(/invalid input syntax for type integer/);
    await expect(run("INSERT INTO comanda_items (barbershop_id, comanda_id, kind, service_id, name, unit_price_cents, quantity, barber_id, added_by, added_at) VALUES ($1, $2, 'service', $3, 'x', $4, 1, $5, $5, $6)", [a.id, aComanda, aService, 0.1 + 0.2, a.ownerId, T0])).rejects.toThrow(/invalid input syntax for type integer/);
  });

  it("clients: invalid phone numbers; an erased client has no personal data", async () => {
    await expectPgError(addClient(db, a, "Telefone ruim", "12345"), PG.checkViolation);
    await expectPgError(addClient(db, a, "Telefone ruim 2", "11 98888-1111"), PG.checkViolation);
    await expectPgError(run("INSERT INTO clients (barbershop_id, name, phone, anonymized_at) VALUES ($1, 'Fulano', '11977772222', now())", [a.id]), PG.checkViolation);
    await run("INSERT INTO clients (barbershop_id, name, anonymized_at) VALUES ($1, 'Cliente removido', now())", [a.id]);
  });

  it("comanda states: each state needs its own fields", async () => {
    await expectPgError(insertComanda(a, { status: "closed" }), PG.checkViolation); // no payment
    await expectPgError(insertComanda(a, { status: "cancelled" }), PG.checkViolation); // no reason
    await expectPgError(insertComanda(a, { status: "cancelled", cancellation_reason: "x", cancellation_by: "u", cancellation_at: T0 }), PG.checkViolation); // reason too short
    await expectPgError(insertComanda(a, { status: "no_show", no_show_at: T0, no_show_by: a.ownerId }), PG.checkViolation); // no appointment
    await expectPgError(insertComanda(a, { status: "discarded" }), PG.checkViolation);
    await expectPgError(insertComanda(a, { pending_since: T0, status: "no_show", no_show_at: T0, no_show_by: a.ownerId, appointment_at: T0, appointment_barber_id: a.ownerId, client_id: aClient }), PG.checkViolation); // pending only when open
  });

  it("comanda valid states are accepted: cancelled by the system, no-show with appointment, paid, pending", async () => {
    await insertComanda(a, { status: "cancelled", cancellation_reason: "Expirou: 5 dias pendente", cancellation_by: "system", cancellation_at: T0 });
    await insertComanda(a, { status: "no_show", no_show_at: T0, no_show_by: a.ownerId, appointment_at: T0, appointment_barber_id: aBarber.userId, client_id: aClient });
    await insertComanda(a, { status: "open", pending_since: T0 });
    await insertComanda(a, { status: "closed", closed_at: T0, closed_by: a.ownerId, payment_method: "cash", payment_total_cents: 4500, payment_received_cash_cents: 5000, payment_change_cents: 500, payment_register_id: aRegister });
  });

  it("R-CMD-20: an appointment needs a client AND a barber; R-CMD-10: a discount has an author", async () => {
    await expectPgError(insertComanda(a, { appointment_at: T0, appointment_barber_id: a.ownerId }), PG.checkViolation); // no client
    await expectPgError(insertComanda(a, { client_id: aClient, appointment_at: T0 }), PG.checkViolation); // no barber
    await expectPgError(insertComanda(a, { discount_cents: 500 }), PG.checkViolation); // nobody gave it
    await expectPgError(insertComanda(a, { discount_cents: 0, discount_given_by: a.ownerId, discount_at: T0 }), PG.checkViolation);
  });

  it("the NULL pitfall: a missing reason, price or author is refused, not silently accepted", async () => {
    // the product has no price; the discount has no amount; the change has no received cash...
    await expectPgError(run("INSERT INTO products (barbershop_id, name, use, sale_price_cents) VALUES ($1, 'sem preco', 'sale', NULL)", [a.id]), PG.checkViolation);
    await expectPgError(insertComanda(a, { discount_given_by: a.ownerId, discount_at: T0 }), PG.checkViolation);
    await expectPgError(
      insertComanda(a, { status: "closed", closed_at: T0, closed_by: a.ownerId, payment_method: "cash", payment_total_cents: 100, payment_register_id: aRegister, payment_change_cents: 50 }),
      PG.checkViolation,
    );
  });

  it("payment: cash received must cover the total and only applies to cash", async () => {
    const paid = { status: "closed", closed_at: T0, closed_by: a.ownerId, payment_total_cents: 4500, payment_register_id: aRegister };
    await expectPgError(insertComanda(a, { ...paid, payment_method: "cash", payment_received_cash_cents: 1000 }), PG.checkViolation);
    await expectPgError(insertComanda(a, { ...paid, payment_method: "pix", payment_received_cash_cents: 5000 }), PG.checkViolation);
    await expectPgError(insertComanda(a, { ...paid, payment_method: "bitcoin" }), PG.checkViolation);
    await expectPgError(insertComanda(a, { ...paid, payment_method: "cash", payment_received_cash_cents: 5000, payment_change_cents: 999 }), PG.checkViolation); // change must be received - total
    await insertComanda(a, { ...paid, payment_method: "cash", payment_received_cash_cents: 5000, payment_change_cents: 500 });
  });

  it("items: quantity 1–20; a service has no product; only products can be sold without stock", async () => {
    const item = (over: Record<string, unknown>) => {
      const row = { barbershop_id: a.id, comanda_id: aComanda, kind: "service", service_id: aService, name: "x", unit_price_cents: 100, quantity: 1, barber_id: a.ownerId, added_by: a.ownerId, added_at: T0, ...over };
      const keys = Object.keys(row);
      return db.adminPool.query(`INSERT INTO comanda_items (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
    };
    await expectPgError(item({ quantity: 0 }), PG.checkViolation);
    await expectPgError(item({ quantity: 21 }), PG.checkViolation);
    await expectPgError(item({ unit_price_cents: 0 }), PG.checkViolation);
    await expectPgError(item({ product_id: aProduct }), PG.checkViolation); // service with a product
    await expectPgError(item({ kind: "product", service_id: null, product_id: null }), PG.checkViolation);
    await expectPgError(item({ sold_without_stock_by: a.ownerId, sold_without_stock_at: T0 }), PG.checkViolation); // a service has no stock
    await expectPgError(item({ removed_by: a.ownerId }), PG.checkViolation); // removed_by without removed_at
    await item({ kind: "product", service_id: null, product_id: aProduct, sold_without_stock_by: a.ownerId, sold_without_stock_at: T0 });
  });

  it("cash movements: the sign must match the type; withdrawals are cash only", async () => {
    const move = (type: string, method: string, amount: number, comanda: string | null = null) =>
      db.adminPool.query(
        `INSERT INTO cash_movements (barbershop_id, register_id, type, method, amount_cents, description, comanda_id, user_id, at) VALUES ($1, $2, $3, $4, $5, 'x', $6, $7, $8)`,
        [a.id, aRegister, type, method, amount, comanda, a.ownerId, T0],
      );
    await expectPgError(move("sale", "pix", -100, aComanda), PG.checkViolation);
    await expectPgError(move("expense", "cash", 100), PG.checkViolation);
    await expectPgError(move("withdrawal", "pix", -100), PG.checkViolation);
    await expectPgError(move("sale", "pix", 100), PG.checkViolation); // a sale needs its comanda
    await expectPgError(move("expense", "cash", -100, aComanda), PG.checkViolation); // an expense has no comanda
    await expectPgError(move("expense", "cash", 0), PG.checkViolation);
    await move("expense", "cash", -100);
    await move("sale", "pix", 4500, aComanda);
    await move("sale_reversal", "pix", -4500, aComanda);
  });

  it("stock movements: the sign must match the type; losses and adjustments need a reason", async () => {
    const move = (type: string, quantity: number, reason: string | null = null, comanda: string | null = null) =>
      db.adminPool.query(
        `INSERT INTO stock_movements (barbershop_id, product_id, type, quantity, at, user_id, reason, comanda_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [a.id, aProduct, type, quantity, T0, a.ownerId, reason, comanda],
      );
    await expectPgError(move("purchase", -1), PG.checkViolation);
    await expectPgError(move("sale", 1, null, aComanda), PG.checkViolation);
    await expectPgError(move("sale", -1), PG.checkViolation); // a sale needs its comanda
    await expectPgError(move("loss", -1), PG.checkViolation); // no reason
    await expectPgError(move("adjustment", 0, "contagem"), PG.checkViolation);
    await expectPgError(move("adjustment", 3, "x"), PG.checkViolation);
    await move("loss", -1, "Frasco quebrado");
    await move("adjustment", -2, "Contagem mensal");
  });

  it("registers: a closed register needs its count; a difference needs a reason; cash left cannot exceed what was counted", async () => {
    const closed = (extra: string) =>
      db.adminPool.query(
        `INSERT INTO cash_registers (barbershop_id, status, opened_at, opened_by, opening_cash_cents, closed_at, closed_by, counted_cash_cents, difference_cents, left_in_drawer_cents, difference_reason)
         VALUES ($1, 'closed', $2, $3, 10000, $2, $3, 10000, ${extra})`,
        [a.id, T0, a.ownerId],
      );
    await expectPgError(closed("-850, 10000, NULL"), PG.checkViolation); // difference without a reason
    await expectPgError(closed("-850, 10000, 'x'"), PG.checkViolation);
    await expectPgError(closed("0, 10001, NULL"), PG.checkViolation); // left more than counted
    await closed("-850, 10000, 'Troco errado na 1023'");
    await closed("0, 4000, NULL");
    await expectPgError(
      db.adminPool.query(`INSERT INTO cash_registers (barbershop_id, status, opened_at, opened_by, opening_cash_cents, opening_reason) VALUES ($1, 'closed', $2, $3, 1, NULL)`, [a.id, T0, a.ownerId]),
      PG.checkViolation,
    );
  });

  it("settings: deadlines and time zones are validated", async () => {
    await expectPgError(run("UPDATE barbershops SET pending_expiry_days = 0 WHERE id = $1", [a.id]), PG.checkViolation);
    await expectPgError(run("UPDATE barbershops SET pending_expiry_days = 31 WHERE id = $1", [a.id]), PG.checkViolation);
    await expectPgError(run("UPDATE barbershops SET away_after_days = 3 WHERE id = $1", [a.id]), PG.checkViolation);
    await expectPgError(run("UPDATE barbershops SET time_zone = 'Mars/Olympus' WHERE id = $1", [a.id]), PG.invalidParameter);
    await run("UPDATE barbershops SET pending_expiry_days = 5 WHERE id = $1", [a.id]);
  });
});

describe("stock and cash are DERIVED from movements", () => {
  it("R-STK-02: stock = sum of the movements, never a stored number", async () => {
    const shop = await createShop(db, "Barbearia Estoque", "estoque@x.com");
    const product = await addProduct(db, shop, "Gel");
    const stock = () => db.as(shop.owner, async (tx) => (await tx.one<{ stock: number }>("SELECT stock FROM product_stock WHERE product_id = $1", [product])).stock);
    expect(await stock()).toBe(0);
    await addPurchase(db, shop, product, 10);
    await db.adminPool.query(`INSERT INTO stock_movements (barbershop_id, product_id, type, quantity, at, user_id, reason) VALUES ($1, $2, 'loss', -3, $3, $4, 'Frasco quebrado')`, [shop.id, product, T0, shop.ownerId]);
    expect(await stock()).toBe(7);
    // R-STK-04: stock may go negative after a confirmed sale without stock; it is shown, not hidden.
    await db.adminPool.query(`INSERT INTO stock_movements (barbershop_id, product_id, type, quantity, at, user_id, reason) VALUES ($1, $2, 'adjustment', -10, $3, $4, 'Contagem mensal')`, [shop.id, product, T0, shop.ownerId]);
    expect(await stock()).toBe(-3);
  });

  it("R-CSH-02: cash in the drawer = sum of the movements paid in cash (Pix never counts)", async () => {
    const shop = await createShop(db, "Barbearia Caixa", "caixa@x.com");
    const register = await insertRegister(shop);
    const comanda = await insertComanda(shop);
    const move = (type: string, method: string, amount: number, withComanda = false) =>
      db.adminPool.query(
        `INSERT INTO cash_movements (barbershop_id, register_id, type, method, amount_cents, description, comanda_id, user_id, at) VALUES ($1, $2, $3, $4, $5, 'x', $6, $7, $8)`,
        [shop.id, register, type, method, amount, withComanda ? comanda : null, shop.ownerId, T0],
      );
    await move("opening", "cash", 10000);
    await move("sale", "cash", 4700, true);
    await move("sale", "pix", 6000, true);
    await move("expense", "cash", -1850);
    const { rows } = await db.adminPool.query(`SELECT COALESCE(SUM(amount_cents) FILTER (WHERE method = 'cash'), 0)::int AS cash FROM cash_movements WHERE register_id = $1`, [register]);
    expect(rows[0].cash).toBe(12850);
  });
});

describe("comanda numbers (next_comanda_number)", () => {
  it("start at 1 and follow in sequence, separately for each barbershop", async () => {
    const x = await createShop(db, "Barbearia N1", "n1@x.com");
    const y = await createShop(db, "Barbearia N2", "n2@x.com");
    const next = (shop: Shop) => db.as(shop.owner, async (tx) => (await tx.one<{ n: number }>("SELECT next_comanda_number() AS n")).n);
    expect([await next(x), await next(x), await next(y), await next(x)]).toEqual([1, 2, 1, 3]);
  });

  it("25 comandas opened AT THE SAME TIME get 25 different numbers with no gap", async () => {
    const shop = await createShop(db, "Barbearia Corrida", "corrida@x.com");
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => db.as(shop.owner, async (tx) => (await tx.one<{ n: number }>("SELECT next_comanda_number() AS n")).n)),
    );
    expect([...numbers].sort((p, q) => p - q)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("if the transaction fails, the number is given back (no gap)", async () => {
    const shop = await createShop(db, "Barbearia Falha", "falha@x.com");
    const next = () => db.as(shop.owner, async (tx) => (await tx.one<{ n: number }>("SELECT next_comanda_number() AS n")).n);
    expect(await next()).toBe(1);
    await expect(
      db.as(shop.owner, async (tx) => {
        await tx.one("SELECT next_comanda_number()");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await next()).toBe(2);
  });

  it("without a barbershop it cannot give a number", async () => {
    await expect(db.appPool.query("SELECT next_comanda_number()")).rejects.toThrow();
  });
});

describe("login lookup across barbershops (the person is not logged in yet)", () => {
  it("auth_lookup tells which barbershop and role an e-mail has, ignoring case — and nothing else", async () => {
    const { rows } = await db.appPool.query("SELECT * FROM auth_lookup('  Rafael-A@X.com ')");
    expect(rows).toEqual([{ employee_id: aBarber.userId, barbershop_id: a.id, role: "barber", active: true }]);
    expect((await db.appPool.query("SELECT * FROM auth_lookup('ninguem@x.com')")).rows).toEqual([]);
  });

  it("email_taken answers yes or no, but app_user still cannot read other barbershops' people", async () => {
    expect((await db.appPool.query("SELECT email_taken('DONO-B@x.com') AS taken")).rows[0].taken).toBe(true);
    expect((await db.appPool.query("SELECT email_taken('livre@x.com') AS taken")).rows[0].taken).toBe(false);
    const visible = await db.as(a.owner, (tx) => tx.query("SELECT email FROM employees WHERE email = 'dono-b@x.com'"));
    expect(visible).toEqual([]);
  });
});

describe("R-EMP-02: a barbershop keeps at least one active owner", () => {
  it("deactivating or demoting the last owner fails when the transaction commits", async () => {
    const shop = await createShop(db, "Barbearia Dono", "dono-unico@x.com");
    await expectPgError(db.adminPool.query("UPDATE employees SET active = false WHERE id = $1", [shop.ownerId]), PG.checkViolation);
    await expectPgError(db.adminPool.query("UPDATE employees SET role = 'barber' WHERE id = $1", [shop.ownerId]), PG.checkViolation);
  });

  it("a transaction can hand the shop to a new owner (checked at the end, not in the middle)", async () => {
    const shop = await createShop(db, "Barbearia Troca", "dono-antigo@x.com");
    await withAdmin(db.adminPool, async (tx) => {
      await tx.query("INSERT INTO employees (barbershop_id, name, email, role) VALUES ($1, 'Novo Dono', 'dono-novo@x.com', 'owner')", [shop.id]);
      await tx.query("UPDATE employees SET active = false WHERE id = $1", [shop.ownerId]);
    });
    const { rows } = await db.adminPool.query("SELECT count(*)::int AS n FROM employees WHERE barbershop_id = $1 AND role = 'owner' AND active", [shop.id]);
    expect(rows[0].n).toBe(1);
  });
});

describe("creating a barbershop (platform admin)", () => {
  it("creates the barbershop and its owner together, with the default settings", async () => {
    const shop = await createBarbershopWithOwner(db.adminPool, { name: "Barbearia Nova", ownerName: "Ana", ownerEmail: " ANA@Nova.com " });
    const { rows } = await db.adminPool.query(
      "SELECT b.auto_cancel_pending, b.pending_expiry_days, b.time_zone, e.email, e.role FROM barbershops b JOIN employees e ON e.barbershop_id = b.id WHERE b.id = $1",
      [shop.barbershopId],
    );
    expect(rows).toEqual([{ auto_cancel_pending: true, pending_expiry_days: 5, time_zone: "America/Sao_Paulo", email: "ana@nova.com", role: "owner" }]);
  });

  it("all or nothing: a duplicate owner e-mail leaves no half-created barbershop", async () => {
    const before = (await db.adminPool.query("SELECT count(*)::int AS n FROM barbershops")).rows[0].n;
    await expectPgError(createBarbershopWithOwner(db.adminPool, { name: "Barbearia Dup", ownerName: "Dup", ownerEmail: "dono-a@x.com" }), PG.uniqueViolation);
    expect((await db.adminPool.query("SELECT count(*)::int AS n FROM barbershops")).rows[0].n).toBe(before);
  });

  it("refuses an invalid time zone", async () => {
    await expect(createBarbershopWithOwner(db.adminPool, { name: "Barbearia TZ", ownerName: "Tz", ownerEmail: "tz@x.com", timeZone: "Mars/Olympus" })).rejects.toThrow(/Fuso/);
  });
});

describe("migrations", () => {
  async function emptyDb(): Promise<{ pool: Pool; drop: () => Promise<void> }> {
    const name = `m_${id().replace(/-/g, "").slice(0, 14)}`;
    const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
    await root.query(`CREATE DATABASE "${name}"`);
    await root.end();
    const pool = new Pool({ connectionString: urlFor(name), max: 2 });
    return {
      pool,
      async drop() {
        await pool.end();
        const cleanup = new Pool({ connectionString: ADMIN_URL, max: 1 });
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await cleanup.end();
      },
    };
  }

  it("applies each file once, in order; running again does nothing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mig-"));
    await writeFile(path.join(dir, "002_second.sql"), "CREATE TABLE second (x int);");
    await writeFile(path.join(dir, "001_first.sql"), "CREATE TABLE first (x int);");
    const { pool, drop } = await emptyDb();
    try {
      expect(await migrate(pool, dir)).toEqual(["001_first.sql", "002_second.sql"]);
      expect(await migrate(pool, dir)).toEqual([]);
    } finally {
      await drop();
    }
  });

  it("refuses a file that was edited after being applied (history is never rewritten)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mig-"));
    await writeFile(path.join(dir, "001_first.sql"), "CREATE TABLE first (x int);");
    const { pool, drop } = await emptyDb();
    try {
      await migrate(pool, dir);
      await writeFile(path.join(dir, "001_first.sql"), "CREATE TABLE first (x int, y int);");
      await expect(migrate(pool, dir)).rejects.toThrow(/was changed after it was applied/);
    } finally {
      await drop();
    }
  });

  it("a failing migration is rolled back entirely and later ones are not applied", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mig-"));
    await writeFile(path.join(dir, "001_ok.sql"), "CREATE TABLE ok_table (x int);");
    await writeFile(path.join(dir, "002_bad.sql"), "CREATE TABLE half_done (x int); SELECT this_is_not_sql;");
    await writeFile(path.join(dir, "003_later.sql"), "CREATE TABLE later (x int);");
    const { pool, drop } = await emptyDb();
    try {
      await expect(migrate(pool, dir)).rejects.toThrow(/002_bad.sql failed/);
      const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")).rows.map((r) => r.tablename);
      expect(tables).toEqual(["ok_table", "schema_migrations"]);
      expect((await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name)).toEqual(["001_ok.sql"]);
    } finally {
      await drop();
    }
  });

  it("the real schema was applied to the test database", async () => {
    const { rows } = await db.adminPool.query("SELECT name FROM schema_migrations");
    expect(rows.map((r) => r.name)).toEqual(["001_init.sql", "002_lock_out_platform_roles.sql", "003_login_and_idempotency.sql"]);
  });
});

describe("one transaction, many queries started at once", () => {
  it("they wait in line: all answers are right and the driver never sees two at the same time", async () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.message);
    process.on("warning", onWarning);
    const [a1, a2, a3] = await db.as(a.owner, (tx) =>
      Promise.all([tx.query("SELECT 1 AS n"), tx.query("SELECT pg_sleep(0.05), 2 AS n"), tx.query("SELECT 3 AS n")]),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off("warning", onWarning);
    expect([a1[0].n, a2[0].n, a3[0].n]).toEqual([1, 2, 3]);
    expect(warnings.filter((w) => /already executing a query/.test(w))).toEqual([]);
  });

  it("an error in one query does not poison the line: the transaction still reports it", async () => {
    await expect(
      db.as(a.owner, async (tx) => {
        const bad = tx.query("SELECT * FROM table_that_does_not_exist");
        const good = tx.query("SELECT 1");
        await bad;
        return good;
      }),
    ).rejects.toThrow(/does not exist/);
  });
});
