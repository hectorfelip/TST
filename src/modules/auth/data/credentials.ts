/**
 * Password changes, inside a barbershop transaction. The hashes live in a table the
 * application role cannot read: everything goes through the functions of migration 003.
 */
import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { checkPasswordChange, validatePassword } from "../rules/password";
import { hashPassword, verifyPassword } from "./password";

export async function setPasswordCmd(
  tx: Tx,
  ctx: TenantContext,
  input: { employeeId: string; password: string; currentPassword?: string; at?: Date },
): Promise<Result<true>> {
  const at = input.at ?? new Date();
  const who = checkPasswordChange(ctx, input.employeeId);
  if (!who.ok) return who;
  const valid = validatePassword(input.password);
  if (!valid.ok) return valid;
  if (who.value.self) {
    const current = await tx.maybeOne<{ hash: string | null }>("SELECT own_password_hash() AS hash");
    if (!(await verifyPassword(input.currentPassword ?? "", current?.hash))) return fail("NOT_ALLOWED", "A senha atual não confere.");
    // Otherwise the forced change at the first login would change nothing.
    if (input.password === input.currentPassword) return fail("INVALID_INPUT", "A senha nova precisa ser diferente da atual.");
  }
  const hash = await hashPassword(input.password);
  try {
    // A password someone else chose for you is temporary: you must change it at the next login. One you chose is not.
    await tx.query("SELECT set_password($1, $2, $3, $4)", [input.employeeId, hash, at, !who.value.self]);
  } catch (error) {
    if ((error as { code?: string }).code === "42501") return fail("WRONG_TENANT", "Registro não encontrado.");
    throw error;
  }
  await insertAudit(tx, [
    { barbershopId: ctx.barbershopId, action: "employee.password_set", userId: ctx.userId, at, entityId: input.employeeId, details: { self: who.value.self ? 1 : 0 } },
  ]);
  return ok(true);
}
