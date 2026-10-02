"use server";
import { act, type ActionResult } from "@/server/run";
import { money, text, whole } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { fail, ok } from "@/shared/result";
import { adjustStockCmd, createProductCmd, recordPurchaseCmd, recordStockOutCmd } from "../data/commands";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });

export async function createProductAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "inventory.manage", idempotency: idem(formData, "product.create") }, async (tx, ctx) => {
    const use = text(formData, "use");
    if (use !== "sale" && use !== "internal") return fail("INVALID_INPUT", "Escolha se é para venda ou uso interno.");
    const price = money(formData, "price", "Preço de venda");
    if (!price.ok) return price;
    const minStock = whole(formData, "minStock", "Estoque mínimo");
    if (!minStock.ok) return minStock;
    const created = await createProductCmd(tx, ctx, { name: text(formData, "name"), use, salePrice: use === "sale" ? price.value : null, minStock: minStock.value });
    return created.ok ? ok(null) : created;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** Goods arrived: stock goes up. */
export async function purchaseAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "inventory.manage", idempotency: idem(formData, "stock.purchase") }, async (tx, ctx) => {
    const quantity = whole(formData, "quantity", "Quantidade");
    if (!quantity.ok) return quantity;
    const done = await recordPurchaseCmd(tx, ctx, text(formData, "productId"), quantity.value);
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** A physical count: the system records the DIFFERENCE with a reason (a sale in the meantime cannot make it wrong). */
export async function adjustAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "inventory.manage", idempotency: idem(formData, "stock.adjust") }, async (tx, ctx) => {
    const counted = whole(formData, "counted", "Quantidade contada");
    if (!counted.ok) return counted;
    const done = await adjustStockCmd(tx, ctx, text(formData, "productId"), counted.value, text(formData, "reason"));
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** Internal use or a loss (broken, expired). Never negative on purpose. */
export async function stockOutAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "inventory.manage", idempotency: idem(formData, "stock.out") }, async (tx, ctx) => {
    const type = text(formData, "type");
    if (type !== "internal_use" && type !== "loss") return fail("INVALID_INPUT", "Escolha uso interno ou perda.");
    const quantity = whole(formData, "quantity", "Quantidade");
    if (!quantity.ok) return quantity;
    const done = await recordStockOutCmd(tx, ctx, text(formData, "productId"), type, quantity.value, text(formData, "reason"));
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}
