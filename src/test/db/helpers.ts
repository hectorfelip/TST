/**
 * Helpers for database tests.
 *  - `createTestDb()`: a fresh, empty (migrated) database for ONE test file;
 *  - two connections: `adminPool` (the owner, sees everything: like a platform
 *    admin or a bug) and `appPool` (app_user, what the application really uses);
 *  - small functions that insert test data with the admin connection.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createPool, withTenant, type Tx } from "../../db/client";
import { createBarbershopWithOwner } from "../../db/admin";
import type { TenantContext } from "../../shared/tenant";
import { ADMIN_URL, APP_PASSWORD, TEMPLATE_DB, urlFor } from "./config";

export type TestDb = {
  name: string;
  adminPool: Pool;
  appPool: Pool;
  /** Run as the app does: one transaction, one barbershop. */
  as: <T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  const name = `t_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
  try {
    await root.query(`CREATE DATABASE "${name}" TEMPLATE ${TEMPLATE_DB}`);
  } finally {
    await root.end();
  }
  // Dropping the database at the end of the file kills idle connections: that is expected, so it is not logged.
  const quiet = () => undefined;
  const adminPool = createPool(urlFor(name), { max: 4 }, quiet);
  const appPool = createPool(urlFor(name, "app_user", APP_PASSWORD), { max: 8 }, quiet);
  return {
    name,
    adminPool,
    appPool,
    as: (ctx, fn) => withTenant(appPool, ctx, fn),
    async close() {
      await appPool.end();
      await adminPool.end();
      const cleanup = new Pool({ connectionString: ADMIN_URL, max: 1 });
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

export const id = () => randomUUID();
export const T0 = new Date("2026-10-02T12:00:00-03:00");

export type Shop = {
  id: string;
  name: string;
  owner: TenantContext;
  ownerId: string;
  /** Barbers created with `addBarber`. */
  barbers: Record<string, TenantContext>;
};

/** A barbershop with its owner (created like the platform admin does). */
export async function createShop(db: TestDb, name: string, ownerEmail: string): Promise<Shop> {
  const { barbershopId, ownerId } = await createBarbershopWithOwner(db.adminPool, { name, ownerName: `Dono ${name}`, ownerEmail });
  return { id: barbershopId, name, ownerId, owner: { barbershopId, userId: ownerId, role: "owner" }, barbers: {} };
}

export async function addBarber(db: TestDb, shop: Shop, key: string, email = `${key}-${shop.id.slice(0, 6)}@x.com`): Promise<TenantContext> {
  const barberId = id();
  await db.adminPool.query(`INSERT INTO employees (id, barbershop_id, name, email, role) VALUES ($1, $2, $3, $4, 'barber')`, [
    barberId,
    shop.id,
    `Barbeiro ${key}`,
    email,
  ]);
  const ctx: TenantContext = { barbershopId: shop.id, userId: barberId, role: "barber" };
  shop.barbers[key] = ctx;
  return ctx;
}

export async function addService(db: TestDb, shop: Shop, name = "Corte", priceCents = 4500): Promise<string> {
  const serviceId = id();
  await db.adminPool.query(
    `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, favorite) VALUES ($1, $2, $3, $4, 30, true)`,
    [serviceId, shop.id, name, priceCents],
  );
  return serviceId;
}

export async function addProduct(db: TestDb, shop: Shop, name = "Pomada", priceCents: number | null = 4500, use: "sale" | "internal" = "sale"): Promise<string> {
  const productId = id();
  await db.adminPool.query(
    `INSERT INTO products (id, barbershop_id, name, use, sale_price_cents, min_stock) VALUES ($1, $2, $3, $4, $5, 2)`,
    [productId, shop.id, name, use, use === "sale" ? priceCents : null],
  );
  return productId;
}

export async function addClient(db: TestDb, shop: Shop, name = "Marcos Lima", phone: string | null = null): Promise<string> {
  const clientId = id();
  await db.adminPool.query(`INSERT INTO clients (id, barbershop_id, name, phone) VALUES ($1, $2, $3, $4)`, [clientId, shop.id, name, phone]);
  return clientId;
}

export async function addPurchase(db: TestDb, shop: Shop, productId: string, quantity: number): Promise<void> {
  await db.adminPool.query(
    `INSERT INTO stock_movements (barbershop_id, product_id, type, quantity, at, user_id) VALUES ($1, $2, 'purchase', $3, $4, $5)`,
    [shop.id, productId, quantity, T0, shop.ownerId],
  );
}

/**
 * Forces a race to really happen. While `fn` runs, every row written to `table`
 * that matches `when` makes PostgreSQL sleep for a moment BEFORE it is saved:
 * the first person is "in the middle" of the action when the second arrives.
 * Without this, on a fast machine the first action often finishes before the
 * second starts, and a missing lock would go unnoticed.
 */
export async function withSlowWrites<T>(db: TestDb, table: string, when: string, seconds: number, fn: () => Promise<T>, event: "INSERT" | "UPDATE" = "INSERT"): Promise<T> {
  const name = `slow_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  await db.adminPool.query(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(${seconds}); RETURN NEW; END $$;
     CREATE TRIGGER ${name} BEFORE ${event} ON ${table} FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION ${name}();`,
  );
  try {
    return await fn();
  } finally {
    await db.adminPool.query(`DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}()`);
  }
}

/** Insert and expect a PostgreSQL error with this SQLSTATE code. */
export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) throw new Error(`Expected PostgreSQL error ${code}, got ${actual}: ${(error as Error).message}`);
    return;
  }
  throw new Error(`Expected PostgreSQL error ${code}, but it succeeded`);
}

export const PG = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  insufficientPrivilege: "42501",
  invalidParameter: "22023",
} as const;
