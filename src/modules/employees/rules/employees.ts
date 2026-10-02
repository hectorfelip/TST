import { requirePermission } from "@/modules/auth/rules/permissions";
import type { AuditEntry } from "@/shared/audit";
import { fail, ok, type Result } from "@/shared/result";
import { assertSameTenant, type Role, type TenantContext } from "@/shared/tenant";

export type Employee = {
  id: string;
  barbershopId: string;
  name: string;
  /** Login. Each person has an individual account (no shared logins). */
  email: string;
  role: Role;
  active: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** R-EMP-01: only the owner adds people. E-mail is unique (it is the login). */
export function createEmployee(
  ctx: TenantContext,
  input: { id: string; name: string; email: string; role: Role },
  emailTaken: boolean,
): Result<Employee> {
  const allowed = requirePermission(ctx, "employee.manage");
  if (!allowed.ok) return allowed;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 60) return fail("INVALID_INPUT", "Nome deve ter de 2 a 60 caracteres.");
  if (!EMAIL.test(email)) return fail("INVALID_INPUT", "E-mail inválido.");
  if (emailTaken) return fail("NOT_ALLOWED", "Este e-mail já está em uso.");
  return ok({ id: input.id, barbershopId: ctx.barbershopId, name, email, role: input.role, active: true });
}

function otherActiveOwners(team: readonly Employee[], employee: Employee): number {
  return team.filter((e) => e.id !== employee.id && e.barbershopId === employee.barbershopId && e.active && e.role === "owner").length;
}

/** R-EMP-02: a barbershop always keeps at least one active owner. */
function keepsAnOwner(team: readonly Employee[], employee: Employee, next: { role: Role; active: boolean }): boolean {
  const stillOwner = next.active && next.role === "owner";
  return stillOwner || otherActiveOwners(team, employee) > 0;
}

export function changeRole(
  ctx: TenantContext,
  employee: Employee,
  role: Role,
  team: readonly Employee[],
  at: Date,
): Result<{ employee: Employee; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "employee.manage");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, employee);
  if (!tenant.ok) return tenant;
  if (employee.role === role) return fail("INVALID_INPUT", "A pessoa já tem esse papel.");
  if (!keepsAnOwner(team, employee, { role, active: employee.active })) {
    return fail("NOT_ALLOWED", "A barbearia precisa ter pelo menos um dono ativo.");
  }
  return ok({
    employee: { ...employee, role },
    audit: { barbershopId: ctx.barbershopId, action: "employee.role_changed", userId: ctx.userId, at, entityId: employee.id, details: { from: employee.role, to: role } },
  });
}

/**
 * R-EMP-03: people are deactivated, never deleted (their comandas stay).
 * An inactive person cannot log in and cannot receive new items.
 */
export function setEmployeeActive(
  ctx: TenantContext,
  employee: Employee,
  active: boolean,
  team: readonly Employee[],
  at: Date,
): Result<{ employee: Employee; audit: AuditEntry | null }> {
  const allowed = requirePermission(ctx, "employee.manage");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, employee);
  if (!tenant.ok) return tenant;
  if (employee.active === active) return fail("INVALID_INPUT", active ? "A pessoa já está ativa." : "A pessoa já está inativa.");
  if (!keepsAnOwner(team, employee, { role: employee.role, active })) {
    return fail("NOT_ALLOWED", "A barbearia precisa ter pelo menos um dono ativo.");
  }
  return ok({
    employee: { ...employee, active },
    audit: active
      ? null
      : { barbershopId: ctx.barbershopId, action: "employee.deactivated", userId: ctx.userId, at, entityId: employee.id, details: { name: employee.name } },
  });
}
