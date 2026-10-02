/**
 * Sensitive actions produce an AuditEntry. The data layer (step 4) saves it
 * in the same transaction as the change. Audit entries are never edited.
 */
export type AuditAction =
  | "comanda.discount"
  | "comanda.cancel"
  | "comanda.payment_method_changed"
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
  details: Record<string, string | number | null>;
};
