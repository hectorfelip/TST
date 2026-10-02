import { requirePermission } from "@/modules/auth/rules/permissions";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import { assertSameTenant, type TenantContext } from "@/shared/tenant";

export type Service = {
  id: string;
  barbershopId: string;
  name: string;
  price: Cents;
  durationMinutes: number;
  favorite: boolean;
  active: boolean;
};

export type ServiceInput = Pick<Service, "name" | "price" | "durationMinutes" | "favorite">;

function validate(input: ServiceInput): Result<ServiceInput> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return fail("INVALID_INPUT", "Nome do serviço deve ter de 2 a 60 caracteres.");
  if (!Number.isInteger(input.price) || input.price <= 0) return fail("INVALID_INPUT", "Preço deve ser maior que zero.");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480) {
    return fail("INVALID_INPUT", "Duração deve ser entre 5 e 480 minutos.");
  }
  return ok({ ...input, name });
}

/** R-SRV-01: only the owner manages services. */
export function createService(ctx: TenantContext, id: string, input: ServiceInput): Result<Service> {
  const allowed = requirePermission(ctx, "service.manage");
  if (!allowed.ok) return allowed;
  const valid = validate(input);
  if (!valid.ok) return valid;
  return ok({ id, barbershopId: ctx.barbershopId, active: true, ...valid.value });
}

/**
 * R-SRV-02: changing a price never changes comandas that already have the
 * service — each comanda item keeps the price of the moment it was added.
 */
export function updateService(ctx: TenantContext, service: Service, input: ServiceInput): Result<Service> {
  const allowed = requirePermission(ctx, "service.manage");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, service);
  if (!tenant.ok) return tenant;
  const valid = validate(input);
  if (!valid.ok) return valid;
  return ok({ ...service, ...valid.value });
}

/** R-SRV-03: services are deactivated, never deleted (old comandas point to them). */
export function setServiceActive(ctx: TenantContext, service: Service, active: boolean): Result<Service> {
  const allowed = requirePermission(ctx, "service.manage");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, service);
  if (!tenant.ok) return tenant;
  return ok({ ...service, active, favorite: active ? service.favorite : false });
}
