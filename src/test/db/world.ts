/** A barbershop with people, a catalog and a client, ready for the command tests. */
import { randomUUID } from "node:crypto";
import { openRegisterCmd } from "@/modules/finance/data/commands";
import type { Cents } from "@/shared/money";
import { unwrap } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { addBarber, addClient, addProduct, addPurchase, addService, createShop, T0, type Shop, type TestDb } from "./helpers";

export const HOUR = 60 * 60 * 1000;
export const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

export async function createWorld(db: TestDb, name = "Barbearia Teste") {
  const shop = await createShop(db, name, `dono-${randomUUID().slice(0, 8)}@x.com`);
  const rafael = await addBarber(db, shop, "rafael");
  const diego = await addBarber(db, shop, "diego");
  const corte = await addService(db, shop, "Corte", 4500);
  const barba = await addService(db, shop, "Barba", 3500);
  const pomada = await addProduct(db, shop, "Pomada", 4500);
  await addPurchase(db, shop, pomada, 2); // 2 in stock, as in the step 2 mock-up
  const marcos = await addClient(db, shop, "Marcos Lima", "11977772222");
  const andre = await addClient(db, shop, "André Souza", "11988881111");
  return { shop, owner: shop.owner, rafael, diego, corte, barba, pomada, marcos, andre };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

/** Opens the register as `who` (default: the owner), at the given time. */
export async function openCash(db: TestDb, shop: Shop, openingCash: Cents = 10000, who: TenantContext = shop.owner, when = at(-1)) {
  return unwrap(await db.as(who, (tx) => openRegisterCmd(tx, who, { openingCash, at: when })));
}
