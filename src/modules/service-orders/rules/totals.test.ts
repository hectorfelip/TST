import { describe, expect, it } from "vitest";
import { allocateDiscount, barberRevenue, subtotal } from "./totals";

const items = [
  { id: "a", unitPrice: 7000, quantity: 1, barberId: "rafael" },
  { id: "b", unitPrice: 4500, quantity: 1, barberId: "diego" },
  { id: "c", unitPrice: 1200, quantity: 2, barberId: "diego" },
];

describe("allocateDiscount (R-CMD-12)", () => {
  it("shares always add up exactly to the discount", () => {
    for (const discount of [1, 7, 100, 999, 1001, 13900]) {
      const shares = allocateDiscount(items, discount);
      expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(discount);
    }
  });

  it("is proportional to the value of each line", () => {
    const shares = allocateDiscount(items, 1390); // 10% of 13900
    expect(shares.get("a")).toBe(700);
    expect(shares.get("b")).toBe(450);
    expect(shares.get("c")).toBe(240);
  });

  it("leftover cents go to the most expensive line", () => {
    const shares = allocateDiscount([{ id: "x", unitPrice: 100, quantity: 1, barberId: "r" }, { id: "y", unitPrice: 200, quantity: 1, barberId: "r" }], 1);
    expect(shares.get("y")).toBe(1);
    expect(shares.get("x")).toBe(0);
  });

  it("no discount or empty comanda gives zero shares", () => {
    expect([...allocateDiscount(items, 0).values()]).toEqual([0, 0, 0]);
    expect(allocateDiscount([], 500).size).toBe(0);
  });
});

describe("barberRevenue (R-CMD-13)", () => {
  it("counts only the barber's items, after his share of the discount", () => {
    expect(subtotal(items)).toBe(13900);
    expect(barberRevenue({ items, discount: null }, "rafael")).toBe(7000);
    expect(barberRevenue({ items, discount: null }, "diego")).toBe(6900);
    const discounted = { items, discount: { amount: 1390 } };
    expect(barberRevenue(discounted, "rafael")).toBe(6300);
    expect(barberRevenue(discounted, "diego")).toBe(6210);
    expect(barberRevenue(discounted, "rafael") + barberRevenue(discounted, "diego")).toBe(13900 - 1390);
  });
});
