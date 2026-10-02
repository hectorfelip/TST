import type { Tx } from "@/db/client";
import type { Client, ClientVisit } from "../rules/clients";

type Row = { id: string; barbershop_id: string; name: string; phone: string | null; notes: string | null; created_at: Date; anonymized_at: Date | null };
const COLUMNS = "id, barbershop_id, name, phone, notes, created_at, anonymized_at";
const toClient = (r: Row): Client => ({
  id: r.id, barbershopId: r.barbershop_id, name: r.name, phone: r.phone, notes: r.notes, createdAt: r.created_at, anonymizedAt: r.anonymized_at,
});

export async function listClients(tx: Tx): Promise<Client[]> {
  return (await tx.query<Row>(`SELECT ${COLUMNS} FROM clients ORDER BY name`)).map(toClient);
}

export async function getClient(tx: Tx, id: string): Promise<Client | null> {
  const r = await tx.maybeOne<Row>(`SELECT ${COLUMNS} FROM clients WHERE id = $1`, [id]);
  return r ? toClient(r) : null;
}

/** The client that already has this phone in this barbershop, if any (R-CLI-02). */
export async function findByPhone(tx: Tx, phone: string | null): Promise<Client | null> {
  if (!phone) return null;
  const r = await tx.maybeOne<Row>(`SELECT ${COLUMNS} FROM clients WHERE phone = $1`, [phone]);
  return r ? toClient(r) : null;
}

export async function insertClient(tx: Tx, c: Client): Promise<void> {
  await tx.query(`INSERT INTO clients (id, barbershop_id, name, phone, notes, created_at, anonymized_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
    c.id, c.barbershopId, c.name, c.phone, c.notes, c.createdAt, c.anonymizedAt,
  ]);
}

export async function updateClient(tx: Tx, c: Client): Promise<void> {
  await tx.query(`UPDATE clients SET name = $2, phone = $3, notes = $4, anonymized_at = $5 WHERE id = $1`, [c.id, c.name, c.phone, c.notes, c.anonymizedAt]);
}

/**
 * Paid visits of a client: one per comanda AND per barber (so a barber's own
 * visits can be told apart, R-CLI-05). Removed items do not count. The amount
 * is the sum of the items, before any discount.
 */
export async function visitsOf(tx: Tx, clientId: string): Promise<ClientVisit[]> {
  const rows = await tx.query<{ comanda_id: string; at: Date; barber_id: string; description: string; amount: number }>(
    `SELECT c.id AS comanda_id, c.closed_at AS at, i.barber_id,
            string_agg(i.name, ', ' ORDER BY i.seq) AS description,
            SUM(i.unit_price_cents * i.quantity)::int AS amount
     FROM comandas c
     JOIN comanda_items i ON i.barbershop_id = c.barbershop_id AND i.comanda_id = c.id AND i.removed_at IS NULL
     WHERE c.client_id = $1 AND c.status = 'closed'
     GROUP BY c.id, c.closed_at, i.barber_id
     ORDER BY c.closed_at DESC`,
    [clientId],
  );
  return rows.map((r) => ({ comandaId: r.comanda_id, at: r.at, barberId: r.barber_id, description: r.description, amount: r.amount }));
}

/** Times the client booked and did not show up. */
export async function noShowCountOf(tx: Tx, clientId: string): Promise<number> {
  return (await tx.one<{ n: number }>(`SELECT count(*)::int AS n FROM comandas WHERE client_id = $1 AND status = 'no_show'`, [clientId])).n;
}

/** When each client was last paid for (clients without a paid visit are absent). */
export async function lastVisitByClient(tx: Tx): Promise<Map<string, Date>> {
  const rows = await tx.query<{ client_id: string; last: Date }>(
    `SELECT client_id, max(closed_at) AS last FROM comandas WHERE status = 'closed' AND client_id IS NOT NULL GROUP BY client_id`,
  );
  return new Map(rows.map((r) => [r.client_id, r.last]));
}
