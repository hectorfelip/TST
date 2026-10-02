import type { Tx } from "@/db/client";
import type { Service } from "../rules/catalog";

type Row = { id: string; barbershop_id: string; name: string; price_cents: number; duration_minutes: number; favorite: boolean; active: boolean };
const COLUMNS = "id, barbershop_id, name, price_cents, duration_minutes, favorite, active";
const toService = (r: Row): Service => ({
  id: r.id, barbershopId: r.barbershop_id, name: r.name, price: r.price_cents, durationMinutes: r.duration_minutes, favorite: r.favorite, active: r.active,
});

export async function listServices(tx: Tx): Promise<Service[]> {
  return (await tx.query<Row>(`SELECT ${COLUMNS} FROM services ORDER BY favorite DESC, name`)).map(toService);
}

export async function getService(tx: Tx, id: string): Promise<Service | null> {
  const r = await tx.maybeOne<Row>(`SELECT ${COLUMNS} FROM services WHERE id = $1`, [id]);
  return r ? toService(r) : null;
}

export async function insertService(tx: Tx, s: Service): Promise<void> {
  await tx.query(
    `INSERT INTO services (id, barbershop_id, name, price_cents, duration_minutes, favorite, active) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [s.id, s.barbershopId, s.name, s.price, s.durationMinutes, s.favorite, s.active],
  );
}

export async function updateService(tx: Tx, s: Service): Promise<void> {
  await tx.query(`UPDATE services SET name = $2, price_cents = $3, duration_minutes = $4, favorite = $5, active = $6 WHERE id = $1`, [
    s.id, s.name, s.price, s.durationMinutes, s.favorite, s.active,
  ]);
}
