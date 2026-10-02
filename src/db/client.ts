/**
 * The ONLY door to the database for the application.
 *
 * `withTenant` opens a transaction, tells PostgreSQL which barbershop it is
 * working for, and gives the code a `Tx`. From that moment Row Level Security
 * hides every other barbershop. There is no way to query without a barbershop:
 * if it is not set, no row matches (fails closed).
 */
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import type { TenantContext } from "@/shared/tenant";

/** A transaction. Everything done through it is saved together or not at all. */
export type Tx = {
  /** All rows. */
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<R[]>;
  /** Exactly one row, or an error. */
  one<R extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<R>;
  /** One row, or null. */
  maybeOne<R extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<R | null>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function wrap(client: PoolClient): Tx {
  // A transaction runs ONE query at a time. If code starts two at once (Promise.all), they wait in line instead
  // of tripping the driver (which warns today and will refuse in the next major version).
  let line: Promise<unknown> = Promise.resolve();
  const query = <R extends QueryResultRow>(text: string, params?: readonly unknown[]): Promise<R[]> => {
    const run = line.then(async () => (await client.query<R>(text, params as unknown[] | undefined)).rows);
    line = run.catch(() => undefined);
    return run;
  };
  return {
    query,
    async one(text, params) {
      const rows = await query(text, params);
      if (rows.length !== 1) throw new Error(`Expected exactly one row, got ${rows.length}`);
      return rows[0] as never;
    },
    async maybeOne(text, params) {
      const rows = await query(text, params);
      if (rows.length > 1) throw new Error(`Expected at most one row, got ${rows.length}`);
      return (rows[0] ?? null) as never;
    },
  };
}

/**
 * An idle connection can die (the database restarted, a network blip). Without
 * an `error` handler Node.js would CRASH the whole process; with it, the pool
 * simply discards that connection and opens another one on demand.
 */
export function createPool(
  connectionString: string,
  config: PoolConfig = {},
  onIdleError: (error: Error) => void = (error) => console.error("[db] idle connection error:", error.message),
): Pool {
  const pool = new Pool({ connectionString, max: 10, ...config });
  pool.on("error", onIdleError);
  return pool;
}

async function inTransaction<T>(pool: Pool, setup: (client: PoolClient) => Promise<void>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setup(client);
    const result = await fn(wrap(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` as ONE transaction on behalf of one barbershop.
 * An error anywhere inside = everything is rolled back.
 */
export function withTenant<T>(pool: Pool, ctx: Pick<TenantContext, "barbershopId" | "userId">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(ctx.barbershopId)) throw new Error("withTenant needs a valid barbershop id");
  return inTransaction(
    pool,
    async (client) => {
      // `true` = local to this transaction: it never leaks to the next user of the pooled connection.
      await client.query("SELECT set_config('app.barbershop_id', $1, true), set_config('app.user_id', $2, true)", [ctx.barbershopId, ctx.userId]);
    },
    fn,
  );
}

/**
 * A transaction with NO barbershop, on the application connection: only for the few things that
 * happen before anybody is identified (logging in). Row Level Security still applies, so a query on
 * a normal table sees nothing; only the SECURITY DEFINER functions of migration 003 can answer.
 */
export function withPublic<T>(pool: Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inTransaction(pool, async () => undefined, fn);
}

/**
 * A transaction WITHOUT a barbershop: for the owner connection used by
 * migrations and admin scripts. The application never uses it.
 */
export function withAdmin<T>(adminPool: Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inTransaction(adminPool, async () => undefined, fn);
}

/**
 * The application must connect as a restricted role. If it connected as a
 * superuser or as the owner of the tables, Row Level Security would not apply
 * and the isolation between barbershops would silently disappear. Call this
 * once at startup and refuse to run otherwise.
 */
export async function assertSafeAppRole(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean; name: string }>(
    `SELECT r.rolsuper, r.rolbypassrls, r.rolname AS name,
            EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns_tables
     FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const role = rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.owns_tables) {
    throw new Error(
      `Unsafe database role "${role?.name}": the application must connect as a non-owner role without superuser or BYPASSRLS (app_user).`,
    );
  }
}
