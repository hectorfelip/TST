import type { Cents } from "@/shared/money";

type Line = { id: string; unitPrice: Cents; quantity: number; barberId: string };

export function lineTotal(item: Pick<Line, "unitPrice" | "quantity">): Cents {
  return item.unitPrice * item.quantity;
}

export function subtotal(items: readonly Pick<Line, "unitPrice" | "quantity">[]): Cents {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

/**
 * R-CMD-12: a discount is split between the items in proportion to their
 * value, in whole cents. Leftover cents go to the most expensive lines first,
 * so the shares always add up exactly to the discount.
 * This keeps each barber's revenue fair (and ready for commission in v2).
 */
export function allocateDiscount(items: readonly Line[], discount: Cents): Map<string, Cents> {
  const shares = new Map<string, Cents>();
  const total = subtotal(items);
  if (discount <= 0 || total === 0) {
    for (const item of items) shares.set(item.id, 0);
    return shares;
  }
  let allocated = 0;
  for (const item of items) {
    const share = Math.floor((lineTotal(item) * discount) / total);
    shares.set(item.id, share);
    allocated += share;
  }
  const byValue = [...items].sort((a, b) => lineTotal(b) - lineTotal(a));
  for (let i = 0; allocated < discount; i = (i + 1) % byValue.length) {
    const id = byValue[i].id;
    shares.set(id, (shares.get(id) ?? 0) + 1);
    allocated += 1;
  }
  return shares;
}

/** R-CMD-13: a barber's revenue = his items, after his share of the discount. */
export function barberRevenue(comanda: { items: readonly Line[]; discount: { amount: Cents } | null }, barberId: string): Cents {
  const shares = allocateDiscount(comanda.items, comanda.discount?.amount ?? 0);
  return comanda.items
    .filter((item) => item.barberId === barberId)
    .reduce((sum, item) => sum + lineTotal(item) - (shares.get(item.id) ?? 0), 0);
}
