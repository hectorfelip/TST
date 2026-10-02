import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { expectError, lamina, NOW, owner, pomada, rafael } from "@/test/fixtures";
import { adjustStock, createProduct, isLowStock, recordPurchase, recordStockOut, saleMovement } from "./stock";

describe("products (R-STK-01)", () => {
  it("owner creates; starts with stock 0", () => {
    expect(unwrap(createProduct(owner, "p", { name: " Gel ", use: "sale", salePrice: 2500, minStock: 3 }))).toMatchObject({ name: "Gel", stock: 0, active: true });
    expectError(createProduct(rafael, "p", { name: "Gel", use: "sale", salePrice: 2500, minStock: 3 }), "FORBIDDEN");
  });

  it("sale products need a price; internal products have none", () => {
    expectError(createProduct(owner, "p", { name: "Gel", use: "sale", salePrice: null, minStock: 0 }), "INVALID_INPUT");
    expectError(createProduct(owner, "p", { name: "Gel", use: "sale", salePrice: 0, minStock: 0 }), "INVALID_INPUT");
    expectError(createProduct(owner, "p", { name: "Lâmina", use: "internal", salePrice: 100, minStock: 0 }), "INVALID_INPUT");
    expectError(createProduct(owner, "p", { name: "Gel", use: "sale", salePrice: 100, minStock: -1 }), "INVALID_INPUT");
  });
});

it("R-STK-02: low stock = below the minimum", () => {
  expect(isLowStock(pomada)).toBe(true); // 2 < 5
  expect(isLowStock({ stock: 5, minStock: 5 })).toBe(false);
  expect(isLowStock({ stock: -1, minStock: 0 })).toBe(true);
});

describe("movements", () => {
  it("R-STK-03: purchase adds whole quantities", () => {
    expect(unwrap(recordPurchase(owner, pomada, 10, NOW)).product.stock).toBe(12);
    expectError(recordPurchase(owner, pomada, 0, NOW), "INVALID_INPUT");
    expectError(recordPurchase(owner, pomada, 1.5, NOW), "INVALID_INPUT");
    expectError(recordPurchase(rafael, pomada, 1, NOW), "FORBIDDEN");
  });

  it("R-STK-05: internal use / loss removes stock and needs a reason", () => {
    const { product, movement } = unwrap(recordStockOut(owner, lamina, "internal_use", 1, "Uso no dia", NOW));
    expect(product.stock).toBe(0);
    expect(movement).toMatchObject({ type: "internal_use", quantity: -1, reason: "Uso no dia" });
    expectError(recordStockOut(owner, lamina, "loss", 1, "", NOW), "INVALID_INPUT");
  });

  it("R-STK-06: adjustment sets the counted quantity, needs a reason, is audited", () => {
    const { product, movement, audit } = unwrap(adjustStock(owner, pomada, 0, "Contagem mensal", NOW));
    expect(product.stock).toBe(0);
    expect(movement.quantity).toBe(-2);
    expect(audit).toMatchObject({ action: "stock.adjusted", details: { before: 2, after: 0 } });
    expectError(adjustStock(owner, pomada, 2, "Contagem mensal", NOW), "INVALID_INPUT");
    expectError(adjustStock(owner, pomada, -1, "Contagem mensal", NOW), "INVALID_INPUT");
    expectError(adjustStock(owner, pomada, 0, "", NOW), "INVALID_INPUT");
  });

  it("R-STK-04: sale and reversal movements mirror each other", () => {
    expect(saleMovement("s", "p", 2, "c", "u", NOW).quantity).toBe(-2);
    expect(saleMovement("s", "p", 2, "c", "u", NOW, true)).toMatchObject({ type: "sale_reversal", quantity: 2 });
  });
});
