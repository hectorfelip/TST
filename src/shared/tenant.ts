/**
 * Every request runs inside one barbershop (tenant).
 * Rule: every read or write in a module's data layer receives a TenantContext
 * and filters by barbershopId. There is no data access without it.
 */
export type Role = "owner" | "barber";

export type TenantContext = {
  barbershopId: string;
  userId: string;
  role: Role;
};
