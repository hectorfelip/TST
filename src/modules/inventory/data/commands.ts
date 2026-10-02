import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { adjustStock, createProduct, recordPurchase, recordStockOut, type Product, type ProductInput, type StockMovement } from "../rules/stock";
import { randomUUID } from "node:crypto";
import { getProduct, insertProduct, insertStockMovements, lockProducts } from "./inventory.repo";

const notFound = () => fail("WRONG_TENANT", "Registro não encontrado.");

export async function createProductCmd(tx: Tx, ctx: TenantContext, input: ProductInput): Promise<Result<Product>> {
  const product = createProduct(ctx, randomUUID(), input);
  if (!product.ok) return product;
  await insertProduct(tx, product.value);
  return product;
}

export async function recordPurchaseCmd(tx: Tx, ctx: TenantContext, productId: string, quantity: number, at = new Date()): Promise<Result<Product>> {
  await lockProducts(tx, [productId], "update");
  const product = await getProduct(tx, productId);
  if (!product) return notFound();
  const result = recordPurchase(ctx, product, quantity, at);
  if (!result.ok) return result;
  await insertStockMovements(tx, [result.value.movement]);
  return ok(result.value.product);
}

export async function recordStockOutCmd(
  tx: Tx, ctx: TenantContext, productId: string, type: "internal_use" | "loss", quantity: number, reason: string, at = new Date(),
): Promise<Result<Product>> {
  await lockProducts(tx, [productId], "update");
  const product = await getProduct(tx, productId);
  if (!product) return notFound();
  const result = recordStockOut(ctx, product, type, quantity, reason, at);
  if (!result.ok) return result;
  await insertStockMovements(tx, [result.value.movement]);
  return ok(result.value.product);
}

/**
 * R-STK-06: the product is LOCKED while the stock is read and the difference is written,
 * so a sale that happens in between cannot make the adjustment wrong.
 */
export async function adjustStockCmd(
  tx: Tx, ctx: TenantContext, productId: string, countedQuantity: number, reason: string, at = new Date(),
): Promise<Result<{ product: Product; movement: StockMovement }>> {
  await lockProducts(tx, [productId], "update");
  const product = await getProduct(tx, productId);
  if (!product) return notFound();
  const result = adjustStock(ctx, product, countedQuantity, reason, at);
  if (!result.ok) return result;
  await insertStockMovements(tx, [result.value.movement]);
  if (result.value.audit) await insertAudit(tx, [result.value.audit]);
  return ok({ product: result.value.product, movement: result.value.movement });
}
