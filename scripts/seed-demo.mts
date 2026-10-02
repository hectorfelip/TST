/**
 * npm run db:seed — creates "Barbearia Exemplo" with a whole day of demo data.
 * Needs DATABASE_ADMIN_URL (owner) and DATABASE_URL (app_user).
 */
import { createPool } from "../src/db/client";
import { DEMO_PASSWORD, seedDemo } from "../src/db/seed";

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;
if (!adminUrl || !appUrl) {
  console.error("Set DATABASE_ADMIN_URL (owner) and DATABASE_URL (app_user).");
  process.exit(1);
}
const adminPool = createPool(adminUrl, { max: 1 });
const appPool = createPool(appUrl, { max: 2 });
try {
  const result = await seedDemo(adminPool, appPool, new Date(), process.env.SEED_EMAIL_SUFFIX ?? "");
  const suffix = process.env.SEED_EMAIL_SUFFIX ?? "";
  console.log(
    `Demo barbershop created.\n  barbershop id: ${result.barbershopId}\n` +
      `  owner:  carlos${suffix}@exemplo.com\n  barbers: rafael${suffix}@exemplo.com, diego${suffix}@exemplo.com\n  password (all of them): ${DEMO_PASSWORD}`,
  );
} finally {
  await appPool.end();
  await adminPool.end();
}
