/**
 * Runs once before all database tests:
 * 1. makes sure a PostgreSQL is reachable (starts the sandbox one if needed);
 * 2. builds a TEMPLATE database with all migrations applied. Every test file
 *    then gets its own copy in milliseconds, so tests never see each other's data.
 */
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { migrate } from "../../db/migrate";
import { ADMIN_URL, APP_PASSWORD, TEMPLATE_DB, urlFor } from "./config";

async function reachable(): Promise<boolean> {
  const pool = new Pool({ connectionString: ADMIN_URL, max: 1, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

export default async function setup() {
  let startedHere = false;
  if (!(await reachable())) {
    if (process.env.TEST_DATABASE_URL) throw new Error(`Cannot connect to TEST_DATABASE_URL (${ADMIN_URL.replace(/:[^:@]*@/, ":***@")})`);
    try {
      execFileSync("bash", ["scripts/test-db.sh", "start"], { stdio: "inherit" });
      startedHere = true;
    } catch {
      throw new Error("No PostgreSQL for the tests. Set TEST_DATABASE_URL to an empty PostgreSQL >= 15 (see scripts/test-db.sh).");
    }
  }

  const admin = new Pool({ connectionString: ADMIN_URL, max: 2 });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
  const templatePool = new Pool({ connectionString: urlFor(TEMPLATE_DB), max: 1 });
  try {
    await migrate(templatePool);
  } finally {
    await templatePool.end();
  }
  // The role is created by the migration; the tests give it a password so they work with any pg_hba.conf.
  const admin2 = new Pool({ connectionString: ADMIN_URL, max: 1 });
  try {
    await admin2.query(`ALTER ROLE app_user PASSWORD '${APP_PASSWORD}'`);
  } finally {
    await admin2.end();
  }

  return async () => {
    const cleanup = new Pool({ connectionString: ADMIN_URL, max: 1 });
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
    } finally {
      await cleanup.end();
    }
    if (startedHere) execFileSync("bash", ["scripts/test-db.sh", "stop"], { stdio: "inherit" });
  };
}
