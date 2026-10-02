/** npm run db:migrate — applies the pending migrations. Needs DATABASE_ADMIN_URL (the owner). */
import { createPool } from "../src/db/client";
import { migrate } from "../src/db/migrate";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("Set DATABASE_ADMIN_URL (the database OWNER, not app_user).");
  process.exit(1);
}
const pool = createPool(url, { max: 1 });
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
} finally {
  await pool.end();
}
