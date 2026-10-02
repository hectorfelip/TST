/** Money numbers of a period, derived from the cash movements (the single source of truth for money). */
import type { Tx } from "@/db/client";
import type { Cents } from "@/shared/money";
import type { PaymentMethod } from "../rules/cash-register";

export type MoneyTotals = {
  /** Sales minus refunds. */
  income: Cents;
  expenses: Cents;
  /** Cash the owner took out of the drawer. It is not an expense. */
  withdrawals: Cents;
  byMethod: Record<PaymentMethod, Cents>;
};

export async function moneyTotals(tx: Tx, from: Date, to: Date): Promise<MoneyTotals> {
  const rows = await tx.query<{ type: string; method: PaymentMethod; total: number }>(
    `SELECT type, method, SUM(amount_cents)::int AS total FROM cash_movements WHERE at >= $1 AND at < $2 GROUP BY type, method`,
    [from, to],
  );
  const totals: MoneyTotals = { income: 0, expenses: 0, withdrawals: 0, byMethod: { cash: 0, pix: 0, debit: 0, credit: 0 } };
  for (const r of rows) {
    if (r.type === "sale" || r.type === "sale_reversal") totals.income += r.total;
    if (r.type === "expense") totals.expenses += -r.total;
    if (r.type === "withdrawal") totals.withdrawals += -r.total;
    // A payment correction moves money between methods: the sum of all methods does not change.
    if (r.type === "sale" || r.type === "sale_reversal" || r.type === "payment_correction") totals.byMethod[r.method] += r.total;
  }
  return totals;
}
