/**
 * Hosted PostgreSQL (Supabase) safety.
 * Supabase creates the roles anon / authenticated / service_role and gives them ALL rights on
 * every new table by default. We simulate exactly that on an empty database, run the real
 * migrations, and check that those roles end with NO door into our data.
 */
import { copyFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_URL, urlFor } from "@/test/db/config";
import { randomUUID } from "node:crypto";
import { MIGRATIONS_DIR, migrate } from "./migrate";

const PLATFORM_ROLES = ["anon", "authenticated", "service_role"];
const dbName = `t_hosted_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
let pool: Pool;
let poolOnlyFirst: Pool;
const dbNameFirst = `${dbName}_first`;

async function simulateSupabase(p: Pool) {
  for (const role of PLATFORM_ROLES) {
    await p.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
    await p.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await p.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
    await p.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`);
    await p.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${role}`);
  }
}

async function freshDatabase(name: string): Promise<Pool> {
  const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
  try {
    await root.query(`CREATE DATABASE "${name}"`);
  } finally {
    await root.end();
  }
  return new Pool({ connectionString: urlFor(name), max: 2 });
}

beforeAll(async () => {
  pool = await freshDatabase(dbName);
  await simulateSupabase(pool);
  await migrate(pool);

  // Control: only migration 001. The simulation must really open the doors, otherwise the test proves nothing.
  poolOnlyFirst = await freshDatabase(dbNameFirst);
  await simulateSupabase(poolOnlyFirst);
  const dir = await mkdtemp(path.join(os.tmpdir(), "mig-"));
  await copyFile(path.join(MIGRATIONS_DIR, "001_init.sql"), path.join(dir, "001_init.sql"));
  await migrate(poolOnlyFirst, dir);
});

afterAll(async () => {
  await pool.end();
  await poolOnlyFirst.end();
  const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
  try {
    await root.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await root.query(`DROP DATABASE IF EXISTS "${dbNameFirst}" WITH (FORCE)`);
  } finally {
    await root.end();
  }
});

async function openDoors(p: Pool, role: string): Promise<string[]> {
  const tables = await p.query<{ n: string }>(
    `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'public' AND c.relkind IN ('r','v','S')
        AND has_table_privilege($1, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`,
    [role],
  );
  const functions = await p.query<{ n: string }>(
    `SELECT pr.proname AS n FROM pg_proc pr JOIN pg_namespace s ON s.oid = pr.pronamespace
      WHERE s.nspname = 'public' AND has_function_privilege($1, pr.oid, 'EXECUTE')`,
    [role],
  );
  return [...tables.rows.map((r) => `table:${r.n}`), ...functions.rows.map((r) => `function:${r.n}`)];
}

describe("hosted PostgreSQL: platform roles have no door into the data", () => {
  it.each(PLATFORM_ROLES)("control: with only migration 001, %s WOULD have access (the simulation is real)", async (role) => {
    const doors = await openDoors(poolOnlyFirst, role);
    expect(doors).toContain("table:employees");
    expect(doors).toContain("function:auth_lookup");
  });

  it.each(PLATFORM_ROLES)("%s has no right on any table, view, sequence or function", async (role) => {
    expect(await openDoors(pool, role)).toEqual([]);
  });

  it("a platform role (anon) is refused on a real query: no right to read tables or call login", async () => {
    const client = await pool.connect();
    try {
      await client.query("SET ROLE anon");
      await expect(client.query("SELECT * FROM employees")).rejects.toMatchObject({ code: "42501" });
      await expect(client.query("SELECT * FROM auth_lookup('a@b.com')")).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("RESET ROLE").catch(() => undefined);
      client.release();
    }
  });

  it("tables created by FUTURE migrations are closed too (default privileges)", async () => {
    await pool.query("CREATE TABLE future_table (id int)");
    await pool.query("CREATE FUNCTION future_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$");
    expect(await openDoors(pool, "anon")).toEqual([]);
    expect(await openDoors(pool, "authenticated")).toEqual([]);
    expect(await openDoors(pool, "service_role")).toEqual([]);
    await pool.query("DROP TABLE future_table");
    await pool.query("DROP FUNCTION future_fn()");
  });

  it("app_user still has exactly what the application needs", async () => {
    const r = await pool.query(
      `SELECT has_table_privilege('app_user', 'comandas', 'SELECT,INSERT,UPDATE') AS rw,
              has_table_privilege('app_user', 'comandas', 'DELETE') AS del,
              has_function_privilege('app_user', 'app_barbershop_id()', 'EXECUTE') AS fn,
              has_function_privilege('app_user', 'auth_lookup(text)', 'EXECUTE') AS login`,
    );
    expect(r.rows[0]).toEqual({ rw: true, del: false, fn: true, login: true });
  });

  it("both migrations are recorded", async () => {
    const r = await pool.query("SELECT name FROM schema_migrations ORDER BY name");
    expect(r.rows.map((x) => x.name)).toEqual(["001_init.sql", "002_lock_out_platform_roles.sql", "003_login_and_idempotency.sql", "004_temporary_passwords.sql", "005_job_without_owner.sql", "006_fixed_search_path.sql"]);
  });
});
