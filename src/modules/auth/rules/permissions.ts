/**
 * Who can do what. This table is the single source of truth: screens use it
 * to hide buttons, and the server uses it to refuse requests (step 5).
 */
import { fail, ok, type Result } from "@/shared/result";
import type { Role, TenantContext } from "@/shared/tenant";

export type Action =
  // comandas
  | "comanda.open"
  | "comanda.edit_own"
  | "comanda.edit_any"
  | "comanda.view_any"
  | "comanda.assign_other_barber"
  | "comanda.discount"
  | "comanda.cancel_closed"
  | "comanda.change_payment_method"
  // cash register
  | "cash.open"
  | "cash.close"
  | "cash.expense"
  | "cash.withdrawal"
  | "cash.view"
  // clients
  | "client.create"
  | "client.edit"
  | "client.anonymize"
  | "client.view_phone"
  | "client.view_full_history"
  // catalog, stock, team, reports, settings
  | "service.manage"
  | "inventory.manage"
  | "employee.manage"
  | "report.view"
  | "settings.manage";

const BARBER_ALLOWED: ReadonlySet<Action> = new Set<Action>([
  "comanda.open",
  "comanda.edit_own",
  "client.create",
]);

export function can(role: Role, action: Action): boolean {
  return role === "owner" || BARBER_ALLOWED.has(action);
}

export function requirePermission(ctx: TenantContext, action: Action): Result<true> {
  return can(ctx.role, action) ? ok(true) : fail("FORBIDDEN", "Você não tem permissão para esta ação.");
}
