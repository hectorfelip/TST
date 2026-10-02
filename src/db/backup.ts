/**
 * Backup = a full copy of the database in ONE file (pg_dump "custom" format), and the way back (pg_restore).
 * A backup that was never restored is only a hope: the test `backup.db.test.ts` restores one for real.
 * Run it with the database OWNER's connection (it must read every row, so Row Level Security must not hide any).
 */
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** pg_dump must be the same version as the server or newer. Set PG_DUMP_BIN / PG_RESTORE_BIN to choose another one. */
const DUMP = process.env.PG_DUMP_BIN ?? "pg_dump";
const RESTORE = process.env.PG_RESTORE_BIN ?? "pg_restore";

/** The password goes in the environment, not in the command line (the command line can be seen by other processes). */
function connection(url: string): { args: string[]; env: NodeJS.ProcessEnv } {
  const u = new URL(url);
  return {
    args: ["--host", u.hostname, "--port", u.port || "5432", "--username", decodeURIComponent(u.username), "--dbname", u.pathname.slice(1)],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password), PGSSLMODE: u.searchParams.get("sslmode") ?? process.env.PGSSLMODE ?? "prefer" },
  };
}

/** "barbershop-2026-10-02T03-00-00Z.dump" — the time is in the name, so files sort by date. */
export function backupFileName(at: Date): string {
  return `barbershop-${at.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-")}.dump`;
}

export async function backupDatabase(adminUrl: string, dir: string, at: Date = new Date()): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, backupFileName(at));
  const { args, env } = connection(adminUrl);
  // --no-owner: the file can be restored by another owner role. The rights (GRANTs) STAY in the file: without them
  // app_user would see nothing after a restore. Roles themselves are not in any dump: see docs/04-data.md section 13.
  await run(DUMP, [...args, "--format=custom", "--no-owner", "--file", file], { env });
  return file;
}

/**
 * Restores into an EMPTY database (it never overwrites one: `--exit-on-error` stops at the first problem).
 * The role `app_user` must already exist on the server (create it, restore, then set its password).
 */
export async function restoreDatabase(adminUrl: string, file: string): Promise<void> {
  const { args, env } = connection(adminUrl);
  await run(RESTORE, [...args, "--no-owner", "--exit-on-error", file], { env });
}
