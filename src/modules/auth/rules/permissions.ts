/**
 * Who can do what. This table is the single source of truth: screens use it
 * to hide buttons, and the server uses it to refuse requests (step 5).
 *
 * To add a role later (e.g. "cashier", wanted by the owner for the finance
 * routine): add it to `Role` in shared/tenant.ts and add ONE entry in
 * ROLE_PERMISSIONS below. The compiler then points to every screen that
 * needs a decision. A cashier would get cash.open, cash.close, cash.expense,
 * cash.withdrawal, cash.view, comanda.edit_any, comanda.view_any and
 * comanda.change_payment_method, but NOT comanda.discount or service/stock/team.
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
  | "comanda.mark_no_show"
  | "comanda.cancel_open"
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

const ROLE_PERMISSIONS: Record<Role, "all" | ReadonlySet<Action>> = {
  owner: "all",
  barber: new Set<Action>([
    "comanda.open",
    "comanda.edit_own",
    // Not a cancellation: the comanda is paused and the absence is recorded.
    "comanda.mark_no_show",
    // The first barber to arrive can open the register. Closing is owner-only.
    "cash.open",
    "client.create",
  ]),
};

export function can(role: Role, action: Action): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions === "all" || permissions.has(action);
}

export function requirePermission(ctx: TenantContext, action: Action): Result<true> {
  return can(ctx.role, action) ? ok(true) : fail("FORBIDDEN", "Você não tem permissão para esta ação.");
}
