import { requirePermission } from "@/modules/auth/rules/permissions";
import type { AuditEntry } from "@/shared/audit";
import type { Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";
import { assertSameTenant, type TenantContext } from "@/shared/tenant";
import { isPositiveInteger, isValidReason } from "@/shared/text";

export type ProductUse = "sale" | "internal";

export type Product = {
  id: string;
  barbershopId: string;
  name: string;
  use: ProductUse;
  /** Only products for sale have a price. */
  salePrice: Cents | null;
  /** Current quantity. Can be negative (see R-STK-04). */
  stock: number;
  minStock: number;
  active: boolean;
};

export type StockMovementType = "purchase" | "sale" | "sale_reversal" | "adjustment" | "internal_use" | "loss";

export type StockMovement = {
  barbershopId: string;
  productId: string;
  type: StockMovementType;
  /** Positive = in, negative = out. */
  quantity: number;
  at: Date;
  userId: string;
  comandaId: string | null;
  reason: string | null;
};

export type ProductInput = Pick<Product, "name" | "use" | "salePrice" | "minStock">;

export function validateProduct(input: ProductInput): Result<ProductInput> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return fail("INVALID_INPUT", "Nome do produto deve ter de 2 a 80 caracteres.");
  if (input.use === "sale" && (input.salePrice === null || !Number.isInteger(input.salePrice) || input.salePrice <= 0)) {
    return fail("INVALID_INPUT", "Produto para venda precisa de preço maior que zero.");
  }
  if (input.use === "internal" && input.salePrice !== null) {
    return fail("INVALID_INPUT", "Produto de uso interno não tem preço de venda.");
  }
  if (!Number.isInteger(input.minStock) || input.minStock < 0) return fail("INVALID_INPUT", "Estoque mínimo não pode ser negativo.");
  return ok({ ...input, name });
}

/** R-STK-01: only the owner manages products. New products start with stock 0. */
export function createProduct(ctx: TenantContext, id: string, input: ProductInput): Result<Product> {
  const allowed = requirePermission(ctx, "inventory.manage");
  if (!allowed.ok) return allowed;
  const valid = validateProduct(input);
  if (!valid.ok) return valid;
  return ok({ id, barbershopId: ctx.barbershopId, stock: 0, active: true, ...valid.value });
}

/** R-STK-02: low stock = below the minimum. */
export function isLowStock(product: Pick<Product, "stock" | "minStock">): boolean {
  return product.stock < product.minStock;
}

function applyMovement(product: Product, movement: StockMovement): Product {
  return { ...product, stock: product.stock + movement.quantity };
}

type MovementResult = { product: Product; movement: StockMovement; audit?: AuditEntry };

function ownerMovement(
  ctx: TenantContext,
  product: Product,
  build: () => Result<Omit<StockMovement, "barbershopId" | "productId" | "userId" | "comandaId">>,
): Result<MovementResult> {
  const allowed = requirePermission(ctx, "inventory.manage");
  if (!allowed.ok) return allowed;
  const tenant = assertSameTenant(ctx, product);
  if (!tenant.ok) return tenant;
  const built = build();
  if (!built.ok) return built;
  const movement: StockMovement = {
    barbershopId: ctx.barbershopId,
    productId: product.id,
    userId: ctx.userId,
    comandaId: null,
    ...built.value,
  };
  return ok({ product: applyMovement(product, movement), movement });
}

/** R-STK-03: purchase adds a positive whole quantity. */
export function recordPurchase(ctx: TenantContext, product: Product, quantity: number, at: Date): Result<MovementResult> {
  return ownerMovement(ctx, product, () =>
    isPositiveInteger(quantity)
      ? ok({ type: "purchase", quantity, at, reason: null })
      : fail("INVALID_INPUT", "Quantidade deve ser um número inteiro maior que zero."),
  );
}

/** R-STK-05: internal use or loss removes stock and needs a reason. */
export function recordStockOut(
  ctx: TenantContext,
  product: Product,
  type: "internal_use" | "loss",
  quantity: number,
  reason: string,
  at: Date,
): Result<MovementResult> {
  return ownerMovement(ctx, product, () => {
    if (!isPositiveInteger(quantity)) return fail("INVALID_INPUT", "Quantidade deve ser um número inteiro maior que zero.");
    if (!isValidReason(reason)) return fail("INVALID_INPUT", "Informe o motivo (mínimo 5 caracteres).");
    return ok({ type, quantity: -quantity, at, reason: reason.trim() });
  });
}

/**
 * R-STK-06: after a physical count, the owner sets the real quantity.
 * Needs a reason and is audited (it can hide theft or mistakes).
 */
export function adjustStock(ctx: TenantContext, product: Product, countedQuantity: number, reason: string, at: Date): Result<MovementResult> {
  const result = ownerMovement(ctx, product, () => {
    if (!Number.isInteger(countedQuantity) || countedQuantity < 0) return fail("INVALID_INPUT", "Quantidade contada deve ser um inteiro maior ou igual a zero.");
    if (countedQuantity === product.stock) return fail("INVALID_INPUT", "A quantidade contada é igual ao estoque atual.");
    if (!isValidReason(reason)) return fail("INVALID_INPUT", "Informe o motivo do ajuste (mínimo 5 caracteres).");
    return ok({ type: "adjustment", quantity: countedQuantity - product.stock, at, reason: reason.trim() });
  });
  if (!result.ok) return result;
  const audit: AuditEntry = {
    barbershopId: ctx.barbershopId,
    action: "stock.adjusted",
    userId: ctx.userId,
    at,
    entityId: product.id,
    details: { before: product.stock, after: countedQuantity, reason: reason.trim() },
  };
  return ok({ ...result.value, audit });
}

/**
 * R-STK-04: a sale is never blocked by the stock count. Stock may go negative
 * (system count is often wrong; losing a real sale is worse). Negative stock
 * shows up as an alert for the owner to recount.
 * Called by the comanda rules when a comanda is closed or cancelled.
 */
export function saleMovement(
  barbershopId: string,
  productId: string,
  quantity: number,
  comandaId: string,
  userId: string,
  at: Date,
  reversal = false,
): StockMovement {
  return {
    barbershopId,
    productId,
    type: reversal ? "sale_reversal" : "sale",
    quantity: reversal ? quantity : -quantity,
    at,
    userId,
    comandaId,
    reason: null,
  };
}
