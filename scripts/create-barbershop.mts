/**
 * npm run db:create-barbershop -- "Barbearia X" "Nome do Dono" dono@email.com [senha]
 * The MVP has no self sign-up: the platform admin creates each barbershop by hand.
 * Without a password, a random one is generated and printed ONCE: give it to the owner. It is TEMPORARY: the owner is asked to choose his own at the first login.
 */
import { randomBytes } from "node:crypto";
import { createBarbershopWithOwner } from "../src/db/admin";
import { createPool } from "../src/db/client";

const [name, ownerName, ownerEmail, givenPassword] = process.argv.slice(2);
const url = process.env.DATABASE_ADMIN_URL;
if (!url || !name || !ownerName || !ownerEmail) {
  console.error('Usage: DATABASE_ADMIN_URL=... npm run db:create-barbershop -- "Barbearia X" "Nome do Dono" dono@email.com [senha]');
  process.exit(1);
}
const ownerPassword = givenPassword ?? randomBytes(9).toString("base64url");
const pool = createPool(url, { max: 1 });
try {
  const { barbershopId, ownerId } = await createBarbershopWithOwner(pool, { name, ownerName, ownerEmail, ownerPassword });
  console.log(`Barbershop created.\n  barbershop id: ${barbershopId}\n  owner id:      ${ownerId}\n  login:         ${ownerEmail}\n  password:      ${ownerPassword}${givenPassword ? "" : "   (generated: shown only now)"}`);
} finally {
  await pool.end();
}
