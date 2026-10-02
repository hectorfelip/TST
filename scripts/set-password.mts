/**
 * npm run db:set-password -- pessoa@email.com [nova-senha]
 * The rescue door: the owner forgot his own password and there is no other owner to reset it.
 * Run by whoever administers the system, with the OWNER connection. Without a password, a random one is printed once.
 * (Everybody else asks the owner: "Equipe > Definir senha nova".)
 */
import { randomBytes } from "node:crypto";
import { setPasswordAsAdmin } from "../src/db/admin";
import { createPool } from "../src/db/client";

const [email, givenPassword] = process.argv.slice(2);
const url = process.env.DATABASE_ADMIN_URL;
if (!url || !email) {
  console.error("Usage: DATABASE_ADMIN_URL=... npm run db:set-password -- pessoa@email.com [nova-senha]");
  process.exit(1);
}
const password = givenPassword ?? randomBytes(9).toString("base64url");
const pool = createPool(url, { max: 1 });
try {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM employees WHERE email = lower(btrim($1))", [email]);
  if (rows.length !== 1) {
    console.error(`No person with the e-mail ${email}.`);
    process.exit(1);
  }
  await setPasswordAsAdmin(pool, rows[0].id, password);
  console.log(`New password for ${email}: ${password}${givenPassword ? "" : "   (generated: shown only now)"}\nAll their open sessions stopped working.`);
} finally {
  await pool.end();
}
