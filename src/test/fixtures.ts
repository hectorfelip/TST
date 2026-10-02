/** Test helpers: two barbershops, an owner and two barbers, a catalog. */
import type { CashMovement, CashRegister } from "@/modules/finance/rules/cash-register";
import { openRegister } from "@/modules/finance/rules/cash-register";
import type { Product } from "@/modules/inventory/rules/stock";
import type { Service } from "@/modules/services/rules/catalog";
import { addItem, openComanda, type BarberRef, type Comanda } from "@/modules/service-orders/rules/comanda";
import { unwrap } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";

export const SHOP = "shop-a";
export const OTHER_SHOP = "shop-b";
export const NOW = new Date("2026-10-02T12:00:00-03:00");

export const owner: TenantContext = { barbershopId: SHOP, userId: "carlos", role: "owner" };
export const rafael: TenantContext = { barbershopId: SHOP, userId: "rafael", role: "barber" };
export const diego: TenantContext = { barbershopId: SHOP, userId: "diego", role: "barber" };
export const intruder: TenantContext = { barbershopId: OTHER_SHOP, userId: "x", role: "owner" };

export const barberRef = (ctx: TenantContext, active = true): BarberRef => ({ id: ctx.userId, barbershopId: ctx.barbershopId, active });

export const corte: Service = { id: "s-corte", barbershopId: SHOP, name: "Corte", price: 4500, durationMinutes: 30, favorite: true, active: true };
export const barba: Service = { id: "s-barba", barbershopId: SHOP, name: "Barba", price: 3500, durationMinutes: 20, favorite: true, active: true };
export const pomada: Product = { id: "p-pomada", barbershopId: SHOP, name: "Pomada", use: "sale", salePrice: 4500, stock: 2, minStock: 5, active: true };
export const lamina: Product = { id: "p-lamina", barbershopId: SHOP, name: "Lâmina", use: "internal", salePrice: null, stock: 1, minStock: 2, active: true };

let seq = 0;
export const nextId = (prefix = "id") => `${prefix}-${++seq}`;

export function openCash(openingCash = 10000): { register: CashRegister; movements: CashMovement[] } {
  const { register, movement } = unwrap(openRegister(owner, { id: nextId("reg"), openingCash, at: NOW }, null));
  return { register, movements: [movement] };
}

export function newComanda(ctx: TenantContext = rafael, number = 1): Comanda {
  return unwrap(openComanda(ctx, { id: nextId("cmd"), number, client: null, at: NOW }));
}

export function withService(comanda: Comanda, ctx: TenantContext, service: Service = corte, barber: TenantContext = ctx): Comanda {
  return unwrap(addItem(ctx, comanda, { itemId: nextId("item"), source: { kind: "service", service }, quantity: 1, barber: barberRef(barber), at: NOW }));
}

export function withProduct(comanda: Comanda, ctx: TenantContext, product: Product = pomada, quantity = 1): Comanda {
  return unwrap(addItem(ctx, comanda, { itemId: nextId("item"), source: { kind: "product", product }, quantity, barber: barberRef(ctx), at: NOW }));
}

export function expectError(result: { ok: boolean; error?: { code: string } } | { ok: true; value: unknown }, code: string) {
  if (result.ok) throw new Error(`Expected error ${code}, got ok`);
  if ("error" in result && result.error?.code !== code) throw new Error(`Expected ${code}, got ${result.error?.code}`);
}
