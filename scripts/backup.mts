/**
 * npm run db:backup [folder]   — saves a full copy of the database into the folder (default ./backups).
 * Needs DATABASE_ADMIN_URL (the owner) and the `pg_dump` program (PostgreSQL client tools).
 * Schedule it once a day (cron, GitHub Actions, ...) and copy the file OFF the server (another cloud/disk).
 */
import { backupDatabase } from "../src/db/backup";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("Set DATABASE_ADMIN_URL (the database OWNER, not app_user).");
  process.exit(1);
}
const file = await backupDatabase(url, process.argv[2] ?? "backups");
console.log(`Backup saved: ${file}`);
