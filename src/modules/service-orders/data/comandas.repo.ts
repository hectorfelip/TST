/**
 * Loads and saves a Comanda as the rules see it: one object with its items,
 * removed items, discount, payment, appointment, no-show and cancellation.
 * The database stores it in two tables (comandas + comanda_items).
 */
import type { Tx } from "@/db/client";
import type { Comanda, ComandaItem, ComandaStatus } from "../rules/comanda";
import type { PaymentMethod } from "@/modules/finance/rules/cash-register";

type ComandaRow = {
  id: string; barbershop_id: string; number: number; client_id: string | null; opened_by: string; opened_at: Date; status: string;
  discount_cents: number | null; discount_given_by: string | null; discount_at: Date | null;
  payment_method: string | null; payment_total_cents: number | null; payment_received_cash_cents: number | null;
  payment_change_cents: number | null; payment_register_id: string | null;
  note: string | null; appointment_at: Date | null; appointment_barber_id: string | null; pending_since: Date | null;
  no_show_by: string | null; no_show_at: Date | null; closed_at: Date | null; closed_by: string | null;
  cancellation_reason: string | null; cancellation_by: string | null; cancellation_at: Date | null;
};

type ItemRow = {
  id: string; comanda_id: string; kind: string; service_id: string | null; product_id: string | null; name: string; unit_price_cents: number;
  quantity: number; barber_id: string; added_by: string; added_at: Date; sold_without_stock_by: string | null; sold_without_stock_at: Date | null;
  removed_by: string | null; removed_at: Date | null;
};

const COMANDA_COLUMNS = `id, barbershop_id, number, client_id, opened_by, opened_at, status, discount_cents, discount_given_by, discount_at,
  payment_method, payment_total_cents, payment_received_cash_cents, payment_change_cents, payment_register_id, note, appointment_at,
  appointment_barber_id, pending_since, no_show_by, no_show_at, closed_at, closed_by, cancellation_reason, cancellation_by, cancellation_at`;

const toItem = (r: ItemRow): ComandaItem => ({
  id: r.id,
  kind: r.kind as ComandaItem["kind"],
  refId: (r.service_id ?? r.product_id) as string,
  name: r.name,
  unitPrice: r.unit_price_cents,
  quantity: r.quantity,
  barberId: r.barber_id,
  addedBy: r.added_by,
  addedAt: r.added_at,
  soldWithoutStock: r.sold_without_stock_by && r.sold_without_stock_at ? { confirmedBy: r.sold_without_stock_by, at: r.sold_without_stock_at } : null,
});

function toComanda(r: ComandaRow, itemRows: ItemRow[]): Comanda {
  return {
    id: r.id,
    barbershopId: r.barbershop_id,
    number: r.number,
    clientId: r.client_id,
    openedBy: r.opened_by,
    openedAt: r.opened_at,
    status: r.status as ComandaStatus,
    items: itemRows.filter((i) => !i.removed_at).map(toItem),
    removedItems: itemRows
      .filter((i) => i.removed_at && i.removed_by)
      .map((i) => ({ item: toItem(i), by: i.removed_by as string, at: i.removed_at as Date })),
    discount: r.discount_cents !== null && r.discount_given_by && r.discount_at ? { amount: r.discount_cents, givenBy: r.discount_given_by, at: r.discount_at } : null,
    payment:
      r.payment_method && r.payment_total_cents !== null && r.payment_register_id
        ? {
            method: r.payment_method as PaymentMethod,
            total: r.payment_total_cents,
            receivedCash: r.payment_received_cash_cents,
            change: r.payment_change_cents,
            registerId: r.payment_register_id,
          }
        : null,
    note: r.note,
    appointment: r.appointment_at && r.appointment_barber_id ? { at: r.appointment_at, barberId: r.appointment_barber_id } : null,
    pendingSince: r.pending_since,
    noShow: r.no_show_at && r.no_show_by ? { by: r.no_show_by, at: r.no_show_at } : null,
    closedAt: r.closed_at,
    closedBy: r.closed_by,
    cancellation: r.cancellation_reason && r.cancellation_by && r.cancellation_at ? { reason: r.cancellation_reason, by: r.cancellation_by, at: r.cancellation_at } : null,
  };
}

/** Loads the comandas that match `where` (an SQL condition on the comandas table) with all their items, in one extra query. */
async function load(tx: Tx, where: string, params: readonly unknown[], suffix = ""): Promise<Comanda[]> {
  const rows = await tx.query<ComandaRow>(`SELECT ${COMANDA_COLUMNS} FROM comandas WHERE ${where} ${suffix}`, params);
  if (rows.length === 0) return [];
  const items = await tx.query<ItemRow>(
    `SELECT id, comanda_id, kind, service_id, product_id, name, unit_price_cents, quantity, barber_id, added_by, added_at,
            sold_without_stock_by, sold_without_stock_at, removed_by, removed_at
     FROM comanda_items WHERE comanda_id = ANY($1::uuid[]) ORDER BY seq`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => toComanda(r, items.filter((i) => i.comanda_id === r.id)));
}

/** `lock`: wait for any other action on the same comanda, so two people cannot close it twice. */
export async function getComanda(tx: Tx, id: string, options: { lock?: boolean } = {}): Promise<Comanda | null> {
  if (options.lock) {
    // Lock first (only the comanda row), then read it with its items.
    const locked = await tx.maybeOne("SELECT id FROM comandas WHERE id = $1 FOR UPDATE", [id]);
    if (!locked) return null;
  }
  return (await load(tx, "id = $1", [id]))[0] ?? null;
}

export function listComandas(tx: Tx, filter: { statuses?: ComandaStatus[]; limit?: number } = {}): Promise<Comanda[]> {
  return load(tx, "($1::text[] IS NULL OR status = ANY($1::text[]))", [filter.statuses ?? null], `ORDER BY number DESC LIMIT ${Math.min(filter.limit ?? 200, 1000)}`);
}

/**
 * What happened to comandas in [from, to) and is no longer open: paid, cancelled, no-show. Discarded
 * empty comandas are not shown anywhere. The "moment" is the latest event of the comanda.
 */
export function listFinishedBetween(tx: Tx, from: Date, to: Date): Promise<Comanda[]> {
  return load(
    tx,
    `status IN ('closed', 'cancelled', 'no_show')
     AND GREATEST(opened_at, closed_at, no_show_at, cancellation_at) >= $1 AND GREATEST(opened_at, closed_at, no_show_at, cancellation_at) < $2`,
    [from, to],
    "ORDER BY number DESC",
  );
}

/** Comandas paid in [from, to) that are still paid (a cancelled one is not revenue). */
export function listClosedBetween(tx: Tx, from: Date, to: Date): Promise<Comanda[]> {
  return load(tx, "status = 'closed' AND closed_at >= $1 AND closed_at < $2", [from, to], "ORDER BY number DESC");
}

/** Open appointments in [from, to): the agenda. The rules (agendaBetween) then decide who sees which. */
export function listAppointments(tx: Tx, from: Date, to: Date): Promise<Comanda[]> {
  return load(tx, "status = 'open' AND appointment_at >= $1 AND appointment_at < $2", [from, to], "ORDER BY appointment_at");
}

/** What the owner goes through when closing the register: open comandas + the no-shows marked since the register opened. */
export function listForDayClose(tx: Tx, registerOpenedAt: Date, options: { lock?: boolean } = {}): Promise<Comanda[]> {
  return load(tx, "status = 'open' OR (status = 'no_show' AND no_show_at >= $1)", [registerOpenedAt], `ORDER BY number${options.lock ? " FOR UPDATE" : ""}`);
}

/** Open comandas that are pending (the owner chose "keep pending" at a closing). */
export function listPending(tx: Tx, options: { lock?: boolean } = {}): Promise<Comanda[]> {
  return load(tx, "status = 'open' AND pending_since IS NOT NULL", [], `ORDER BY pending_since${options.lock ? " FOR UPDATE" : ""}`);
}

export async function nextComandaNumber(tx: Tx): Promise<number> {
  return (await tx.one<{ n: number }>("SELECT next_comanda_number() AS n")).n;
}

export async function insertComanda(tx: Tx, c: Comanda): Promise<void> {
  await tx.query(
    `INSERT INTO comandas (id, barbershop_id, number, client_id, opened_by, opened_at, status, note, appointment_at, appointment_barber_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [c.id, c.barbershopId, c.number, c.clientId, c.openedBy, c.openedAt, c.status, c.note, c.appointment?.at ?? null, c.appointment?.barberId ?? null],
  );
  await syncItems(tx, c);
}

/**
 * Saves everything a rule can change on a comanda. Items are never edited or
 * deleted: new ones are inserted and removed ones are marked (R-CMD-21).
 */
export async function saveComanda(tx: Tx, c: Comanda): Promise<void> {
  await tx.query(
    `UPDATE comandas SET status = $2,
       discount_cents = $3, discount_given_by = $4, discount_at = $5,
       payment_method = $6, payment_total_cents = $7, payment_received_cash_cents = $8, payment_change_cents = $9, payment_register_id = $10,
       note = $11, pending_since = $12, no_show_by = $13, no_show_at = $14, closed_at = $15, closed_by = $16,
       cancellation_reason = $17, cancellation_by = $18, cancellation_at = $19, updated_at = now()
     WHERE id = $1`,
    [
      c.id, c.status,
      c.discount?.amount ?? null, c.discount?.givenBy ?? null, c.discount?.at ?? null,
      c.payment?.method ?? null, c.payment?.total ?? null, c.payment?.receivedCash ?? null, c.payment?.change ?? null, c.payment?.registerId ?? null,
      c.note, c.pendingSince, c.noShow?.by ?? null, c.noShow?.at ?? null, c.closedAt, c.closedBy,
      c.cancellation?.reason ?? null, c.cancellation?.by ?? null, c.cancellation?.at ?? null,
    ],
  );
  await syncItems(tx, c);
}

async function syncItems(tx: Tx, c: Comanda): Promise<void> {
  const known = new Map(
    (await tx.query<{ id: string; removed_at: Date | null }>("SELECT id, removed_at FROM comanda_items WHERE comanda_id = $1", [c.id])).map((r) => [r.id, r.removed_at]),
  );
  const insert = (item: ComandaItem, removed?: { by: string; at: Date }) =>
    tx.query(
      `INSERT INTO comanda_items (id, barbershop_id, comanda_id, kind, service_id, product_id, name, unit_price_cents, quantity, barber_id, added_by, added_at,
                                  sold_without_stock_by, sold_without_stock_at, removed_by, removed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        item.id, c.barbershopId, c.id, item.kind, item.kind === "service" ? item.refId : null, item.kind === "product" ? item.refId : null,
        item.name, item.unitPrice, item.quantity, item.barberId, item.addedBy, item.addedAt,
        item.soldWithoutStock?.confirmedBy ?? null, item.soldWithoutStock?.at ?? null, removed?.by ?? null, removed?.at ?? null,
      ],
    );
  for (const item of c.items) if (!known.has(item.id)) await insert(item);
  for (const removed of c.removedItems) {
    const state = known.get(removed.item.id);
    if (state === undefined) await insert(removed.item, removed);
    else if (state === null) await tx.query("UPDATE comanda_items SET removed_by = $2, removed_at = $3 WHERE id = $1", [removed.item.id, removed.by, removed.at]);
  }
}
