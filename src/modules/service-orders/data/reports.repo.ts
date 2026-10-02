/**
 * Numbers for the reports. Everything is derived from the paid comandas of the period; removed items do not count.
 * "Valor atendido" is the sum of the items a barber did, BEFORE any discount, and it is not a commission.
 */
import type { Tx } from "@/db/client";
import type { Cents } from "@/shared/money";

export type BarberTotal = { barberId: string; comandas: number; revenue: Cents };
export type ServiceCount = { name: string; count: number };

export async function barberTotals(tx: Tx, from: Date, to: Date): Promise<BarberTotal[]> {
  const rows = await tx.query<{ barber_id: string; comandas: number; revenue: number }>(
    `SELECT i.barber_id, count(DISTINCT c.id)::int AS comandas, SUM(i.unit_price_cents * i.quantity)::int AS revenue
     FROM comandas c
     JOIN comanda_items i ON i.barbershop_id = c.barbershop_id AND i.comanda_id = c.id AND i.removed_at IS NULL
     WHERE c.status = 'closed' AND c.closed_at >= $1 AND c.closed_at < $2
     GROUP BY i.barber_id ORDER BY revenue DESC`,
    [from, to],
  );
  return rows.map((r) => ({ barberId: r.barber_id, comandas: r.comandas, revenue: r.revenue }));
}

export async function topServices(tx: Tx, from: Date, to: Date, limit = 5): Promise<ServiceCount[]> {
  const rows = await tx.query<{ name: string; count: number }>(
    `SELECT i.name, SUM(i.quantity)::int AS count
     FROM comandas c
     JOIN comanda_items i ON i.barbershop_id = c.barbershop_id AND i.comanda_id = c.id AND i.removed_at IS NULL
     WHERE c.status = 'closed' AND c.closed_at >= $1 AND c.closed_at < $2 AND i.kind = 'service'
     GROUP BY i.name ORDER BY count DESC, i.name LIMIT $3`,
    [from, to, limit],
  );
  return rows;
}
