/**
 * npm run db:create-barbershop -- "Barbearia X" "Nome do Dono" dono@email.com
 * The MVP has no self sign-up: the platform admin creates each barbershop by hand.
 */
import { createBarbershopWithOwner } from "../src/db/admin";
import { createPool } from "../src/db/client";

const [name, ownerName, ownerEmail] = process.argv.slice(2);
const url = process.env.DATABASE_ADMIN_URL;
if (!url || !name || !ownerName || !ownerEmail) {
  console.error('Usage: DATABASE_ADMIN_URL=... npm run db:create-barbershop -- "Barbearia X" "Nome do Dono" dono@email.com');
  process.exit(1);
}
const pool = createPool(url, { max: 1 });
try {
  const { barbershopId, ownerId } = await createBarbershopWithOwner(pool, { name, ownerName, ownerEmail });
  console.log(`Barbershop created.\n  barbershop id: ${barbershopId}\n  owner id:      ${ownerId}`);
} finally {
  await pool.end();
}
