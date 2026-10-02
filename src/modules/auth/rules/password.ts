/**
 * Passwords. The rules are small on purpose: a barbershop team will not remember a 20-character
 * random password, and a rule people hate ends with passwords on a sticky note. What really
 * protects the accounts is the slow hash, the lock after 5 mistakes, and that the owner can reset.
 */
import { requirePermission } from "@/modules/auth/rules/permissions";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** The passwords everybody tries first. Compared in lower case. */
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "password", "password1", "senha123", "senha1234",
  "12345678a", "qwerty123", "abc12345", "barbearia", "barbearia123", "mudar123", "trocar123",
]);

export function validatePassword(password: string): Result<string> {
  if (password.length < MIN_PASSWORD_LENGTH) return fail("INVALID_INPUT", `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  if (password.length > MAX_PASSWORD_LENGTH) return fail("INVALID_INPUT", `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`);
  if (COMMON.has(password.toLowerCase())) return fail("INVALID_INPUT", "Essa senha é muito comum. Escolha outra.");
  if (new Set(password).size < 3) return fail("INVALID_INPUT", "A senha é simples demais: use mais variedade de caracteres.");
  return ok(password);
}

/**
 * Who changes whose password:
 *  - the OWNER can set a new password for anybody in the barbershop (reset), without knowing the old one;
 *  - everybody can change their OWN, but must type the current one (a phone left unlocked is not enough).
 */
export function checkPasswordChange(ctx: TenantContext, targetEmployeeId: string): Result<{ self: boolean }> {
  if (targetEmployeeId === ctx.userId) return ok({ self: true });
  const allowed = requirePermission(ctx, "employee.manage");
  if (!allowed.ok) return allowed;
  return ok({ self: false });
}
