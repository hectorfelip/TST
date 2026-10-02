import "server-only";
import type { Cents } from "@/shared/money";
import { read } from "@/server/run";
import { listProducts } from "../data/inventory.repo";
import { isLowStock, type ProductUse } from "../rules/stock";

export type ProductRow = { id: string; name: string; use: ProductUse; price: Cents | null; stock: number; minStock: number; low: boolean };

export async function loadProducts(): Promise<ProductRow[]> {
  return read(async (tx) =>
    (await listProducts(tx))
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name, use: p.use, price: p.salePrice, stock: p.stock, minStock: p.minStock, low: isLowStock(p) })),
  );
}
