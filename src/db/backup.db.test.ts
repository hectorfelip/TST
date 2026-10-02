/**
 * A backup is only real if it can be restored. This test saves a database with data, restores the
 * file into a brand new database and checks that the data, the rules and the safety still work there.
 */
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { ADMIN_URL, APP_PASSWORD, urlFor } from "@/test/db/config";
import { addClient, createShop, createTestDb, expectPgError, PG } from "@/test/db/helpers";
import { backupDatabase, backupFileName, restoreDatabase } from "./backup";

const restoredName = `t_restored_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

afterAll(async () => {
  const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
  try {
    await root.query(`DROP DATABASE IF EXISTS "${restoredName}" WITH (FORCE)`);
  } finally {
    await root.end();
  }
});

describe("backup and restore", () => {
  it("the file name carries the date and sorts by time", () => {
    expect(backupFileName(new Date("2026-10-02T03:00:00.123Z"))).toBe("barbershop-2026-10-02T03-00-00Z.dump");
  });

  it("a restored backup has the same data, and the protections still work", async () => {
    const db = await createTestDb();
    try {
      const shop = await createShop(db, "Backup Shop", "dono-backup@x.com");
      await addClient(db, shop, "Cliente do backup");
      await db.adminPool.query("INSERT INTO audit_log (barbershop_id, action, user_id, at, entity_id) VALUES ($1, 'x', 'u', now(), 'e')", [shop.id]);
      const before = await db.adminPool.query("SELECT (SELECT count(*) FROM clients)::int AS clients, (SELECT count(*) FROM employees)::int AS employees, (SELECT count(*) FROM audit_log)::int AS audit");

      const dir = await mkdtemp(path.join(os.tmpdir(), "bk-"));
      const file = await backupDatabase(urlFor(db.name), dir, new Date("2026-10-02T03:00:00Z"));
      expect((await stat(file)).size).toBeGreaterThan(1000);

      const root = new Pool({ connectionString: ADMIN_URL, max: 1 });
      try {
        await root.query(`CREATE DATABASE "${restoredName}"`);
      } finally {
        await root.end();
      }
      // Roles are NOT in the file (they live in the server): app_user already exists here, as it must on a real restore.
      await restoreDatabase(urlFor(restoredName), file);

      const restored = new Pool({ connectionString: urlFor(restoredName), max: 2 });
      const app = new Pool({ connectionString: urlFor(restoredName, "app_user", APP_PASSWORD), max: 2 });
      try {
        const after = await restored.query("SELECT (SELECT count(*) FROM clients)::int AS clients, (SELECT count(*) FROM employees)::int AS employees, (SELECT count(*) FROM audit_log)::int AS audit");
        expect(after.rows[0]).toEqual(before.rows[0]);
        expect(after.rows[0].clients).toBeGreaterThan(0);

        // Row Level Security survived: the application role sees nothing without a barbershop, and its own rows with one.
        expect((await app.query("SELECT count(*)::int AS n FROM clients")).rows[0].n).toBe(0);
        const c = await app.connect();
        try {
          await c.query("BEGIN");
          await c.query("SELECT set_config('app.barbershop_id', $1, true)", [shop.id]);
          expect((await c.query("SELECT count(*)::int AS n FROM clients")).rows[0].n).toBe(before.rows[0].clients);
          await c.query("ROLLBACK");
        } finally {
          c.release();
        }

        // The history protection (append-only) survived too.
        await expectPgError(restored.query("UPDATE audit_log SET at = now()"), PG.insufficientPrivilege);
      } finally {
        await app.end();
        await restored.end();
      }
    } finally {
      await db.close();
    }
  });
});
