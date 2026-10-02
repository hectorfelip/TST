/**
 * Every request runs inside one barbershop (tenant).
 * Rule: every read or write in a module's data layer receives a TenantContext
 * and filters by barbershopId. There is no data access without it.
 */
import { fail, ok, type Result } from "./result";

export type Role = "owner" | "barber";

export type TenantContext = {
  barbershopId: string;
  userId: string;
  role: Role;
};

/** R-TEN-01: an entity from another barbershop is never touched. */
export function assertSameTenant(ctx: TenantContext, entity: { barbershopId: string }): Result<true> {
  if (entity.barbershopId !== ctx.barbershopId) {
    return fail("WRONG_TENANT", "Registro não encontrado.");
  }
  return ok(true);
}
