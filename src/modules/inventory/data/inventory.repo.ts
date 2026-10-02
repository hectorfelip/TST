import type { Tx } from "@/db/client";
import type { Product, StockMovement, StockMovementType } from "../rules/stock";

type ProductRow = { id: string; barbershop_id: string; name: string; use: string; sale_price_cents: number | null; min_stock: number; active: boolean; stock: number };
// The quantity in stock comes from the product_stock view: the SUM of the movements, never a stored number.
const SELECT = `SELECT p.id, p.barbershop_id, p.name, p.use, p.sale_price_cents, p.min_stock, p.active, s.stock
                FROM products p JOIN product_stock s ON s.barbershop_id = p.barbershop_id AND s.product_id = p.id`;
const toProduct = (r: ProductRow): Product => ({
  id: r.id, barbershopId: r.barbershop_id, name: r.name, use: r.use as Product["use"], salePrice: r.sale_price_cents, stock: r.stock, minStock: r.min_stock, active: r.active,
});

export async function listProducts(tx: Tx): Promise<Product[]> {
  return (await tx.query<ProductRow>(`${SELECT} ORDER BY p.name`)).map(toProduct);
}

export async function getProduct(tx: Tx, id: string): Promise<Product | null> {
  const r = await tx.maybeOne<ProductRow>(`${SELECT} WHERE p.id = $1`, [id]);
  return r ? toProduct(r) : null;
}

/** New products start with no movements, so stock 0 (R-STK-01). */
export async function insertProduct(tx: Tx, p: Product): Promise<void> {
  await tx.query(`INSERT INTO products (id, barbershop_id, name, use, sale_price_cents, min_stock, active) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
    p.id, p.barbershopId, p.name, p.use, p.salePrice, p.minStock, p.active,
  ]);
}

export async function updateProduct(tx: Tx, p: Product): Promise<void> {
  await tx.query(`UPDATE products SET name = $2, use = $3, sale_price_cents = $4, min_stock = $5, active = $6 WHERE id = $1`, [
    p.id, p.name, p.use, p.salePrice, p.minStock, p.active,
  ]);
}

/**
 * Locks products so that an adjustment (which reads the stock and then writes
 * the difference) cannot run at the same time as a sale of the same product.
 * Sorted by id: two actions locking the same products never wait for each other in a circle.
 */
export async function lockProducts(tx: Tx, ids: readonly string[], mode: "share" | "update"): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  await tx.query(`SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR ${mode === "update" ? "UPDATE" : "SHARE"}`, [unique]);
}

export async function insertStockMovements(tx: Tx, movements: readonly StockMovement[]): Promise<void> {
  for (const m of movements) {
    await tx.query(
      `INSERT INTO stock_movements (barbershop_id, product_id, type, quantity, at, user_id, comanda_id, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [m.barbershopId, m.productId, m.type, m.quantity, m.at, m.userId, m.comandaId, m.reason],
    );
  }
}

export async function listStockMovements(tx: Tx, productId: string): Promise<StockMovement[]> {
  const rows = await tx.query<{ barbershop_id: string; product_id: string; type: string; quantity: number; at: Date; user_id: string; comanda_id: string | null; reason: string | null }>(
    `SELECT barbershop_id, product_id, type, quantity, at, user_id, comanda_id, reason FROM stock_movements WHERE product_id = $1 ORDER BY at, created_at, id`,
    [productId],
  );
  return rows.map((r) => ({
    barbershopId: r.barbershop_id, productId: r.product_id, type: r.type as StockMovementType, quantity: r.quantity, at: r.at, userId: r.user_id, comandaId: r.comanda_id, reason: r.reason,
  }));
}
