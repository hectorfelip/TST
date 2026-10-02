/**
 * Login and session lookups. They run BEFORE the person is identified, so they use the functions
 * of migration 003 (they look across barbershops and return the minimum).
 */
import type { Tx } from "@/db/client";
import { fail, ok, type Result } from "@/shared/result";
import type { Role } from "@/shared/tenant";
import { DUMMY_HASH, verifyPassword } from "./password";

type LoginRow = { employee_id: string; barbershop_id: string; role: Role; active: boolean; password_hash: string | null; locked_until: Date | null };

export type Identity = { employeeId: string; barbershopId: string };

/**
 * ONE message for every failure (wrong e-mail, wrong password, inactive, locked): the answer must
 * not tell an attacker which e-mails exist. The time is also the same: an unknown e-mail verifies
 * against a dummy hash.
 */
export const LOGIN_FAILED_MESSAGE =
  "E-mail ou senha incorretos, ou acesso bloqueado por tentativas erradas. Se errou várias vezes, espere 15 minutos ou peça ao dono para criar uma senha nova.";

export async function authenticate(tx: Tx, email: string, password: string, now: Date = new Date()): Promise<Result<Identity>> {
  const row = await tx.maybeOne<LoginRow>("SELECT * FROM login_lookup($1)", [email]);
  const matches = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  const locked = row?.locked_until != null && row.locked_until > now;
  if (!row || !row.password_hash || locked) return fail("NOT_ALLOWED", LOGIN_FAILED_MESSAGE);
  if (!matches) {
    await tx.query("SELECT login_failed($1, $2)", [row.employee_id, now]);
    return fail("NOT_ALLOWED", LOGIN_FAILED_MESSAGE);
  }
  if (!row.active) return fail("NOT_ALLOWED", LOGIN_FAILED_MESSAGE);
  await tx.query("SELECT login_succeeded($1)", [row.employee_id]);
  return ok({ employeeId: row.employee_id, barbershopId: row.barbershop_id });
}

export type SessionUser = { employeeId: string; barbershopId: string; name: string; role: Role; passwordChangedAt: Date };

/** Who is this session NOW? Role and "active" come from the database on every request, never from the cookie. */
export async function lookupSessionUser(tx: Tx, employeeId: string): Promise<SessionUser | null> {
  const row = await tx.maybeOne<{ barbershop_id: string; name: string; role: Role; active: boolean; password_changed_at: Date }>(
    "SELECT * FROM session_lookup($1)",
    [employeeId],
  );
  if (!row || !row.active) return null;
  return { employeeId, barbershopId: row.barbershop_id, name: row.name, role: row.role, passwordChangedAt: row.password_changed_at };
}
