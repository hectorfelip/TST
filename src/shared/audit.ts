/**
 * Sensitive actions produce an AuditEntry. The data layer (step 4) saves it
 * in the same transaction as the change. Audit entries are never edited.
 */
export type AuditAction =
  | "comanda.discount"
  | "comanda.cancel"
  | "comanda.expired"
  | "comanda.no_show"
  | "comanda.sold_without_stock"
  | "comanda.payment_method_changed"
  | "cash.opened_with_difference"
  | "cash.closed_with_difference"
  | "cash.closed_with_pending"
  | "cash.withdrawal"
  | "client.anonymized"
  | "stock.adjusted"
  | "employee.role_changed"
  | "employee.deactivated";

export type AuditEntry = {
  barbershopId: string;
  action: AuditAction;
  userId: string;
  at: Date;
  entityId: string;
  /** "system" when the system did it by itself (e.g. a comanda that expired). */
  details: Record<string, string | number | null>;
};
