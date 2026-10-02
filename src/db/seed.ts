/**
 * Demo data: a whole day of a barbershop (the day shown in the step 2 prototype), built through the
 * REAL commands, so it also proves that a whole day of work can be saved. Log in with any of the
 * demo e-mails and DEMO_PASSWORD. NEVER use it in a real barbershop.
 *
 * Needs both connections: the owner (to create the barbershop) and app_user
 * (everything else, exactly as the application does it).
 */
import type { Pool } from "pg";
import { createBarbershopWithOwner, setPasswordAsAdmin } from "@/db/admin";
import { withTenant } from "@/db/client";
import { createClientCmd } from "@/modules/clients/data/commands";
import { createEmployeeCmd, setEmployeeActiveCmd } from "@/modules/employees/data/commands";
import { openRegisterCmd, recordExpenseCmd } from "@/modules/finance/data/commands";
import { createProductCmd, recordPurchaseCmd } from "@/modules/inventory/data/commands";
import { addItemCmd, closeComandaCmd, markNoShowCmd, openComandaCmd } from "@/modules/service-orders/data/commands";
import { createServiceCmd, setServiceActiveCmd } from "@/modules/services/data/commands";
import { DAY_MS, startOfDay } from "@/shared/time";
import { unwrap, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";

const HOUR = 60 * 60 * 1000;

/** The password of every demo person. It is public (it is in the source): demo data only. */
export const DEMO_PASSWORD = "demonstracao-1";

/**
 * E-mails are unique in the whole system, so a second demo barbershop needs a
 * different `emailSuffix` (e.g. "2" gives carlos2@exemplo.com).
 */
export async function seedDemo(adminPool: Pool, appPool: Pool, now: Date = new Date(), emailSuffix = "") {
  const email = (name: string) => `${name}${emailSuffix}@exemplo.com`;
  const { barbershopId, ownerId } = await createBarbershopWithOwner(adminPool, { name: "Barbearia Exemplo", ownerName: "Carlos", ownerEmail: email("carlos"), ownerPassword: DEMO_PASSWORD, ownerPasswordTemporary: false });
  const owner: TenantContext = { barbershopId, userId: ownerId, role: "owner" };
  const day = startOfDay(now, "America/Sao_Paulo");
  const t = (hours: number) => new Date(day.getTime() + hours * HOUR); // hours since 00:00 of the shop's day
  const run = <T>(ctx: TenantContext, fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<Result<T>>): Promise<T> =>
    withTenant(appPool, ctx, fn).then(unwrap);

  // team
  const person = async (name: string, email: string) => {
    const id = (await run(owner, (tx) => createEmployeeCmd(tx, owner, { name, email, role: "barber" }))).id;
    await setPasswordAsAdmin(adminPool, id, DEMO_PASSWORD, { temporary: false });
    return id;
  };
  const rafaelId = await person("Rafael", email("rafael"));
  const diegoId = await person("Diego", email("diego"));
  const brunoId = await person("Bruno", email("bruno"));
  await run(owner, (tx) => setEmployeeActiveCmd(tx, owner, brunoId, false));
  const rafael: TenantContext = { barbershopId, userId: rafaelId, role: "barber" };
  const diego: TenantContext = { barbershopId, userId: diegoId, role: "barber" };

  // catalog
  const service = async (name: string, price: number, minutes: number, favorite: boolean) =>
    (await run(owner, (tx) => createServiceCmd(tx, owner, { name, price, durationMinutes: minutes, favorite }))).id;
  const corte = await service("Corte", 4500, 30, true);
  const barba = await service("Barba", 3500, 20, true);
  const corteBarba = await service("Corte + Barba", 7000, 50, true);
  await service("Pezinho", 2000, 10, true);
  const sobrancelha = await service("Sobrancelha", 1500, 10, false);
  const luzes = await service("Luzes", 12000, 90, true);
  await run(owner, (tx) => setServiceActiveCmd(tx, owner, luzes, false));

  const product = async (name: string, use: "sale" | "internal", price: number | null, min: number, bought: number) => {
    const p = await run(owner, (tx) => createProductCmd(tx, owner, { name, use, salePrice: price, minStock: min }));
    await run(owner, (tx) => recordPurchaseCmd(tx, owner, p.id, bought, t(-48)));
    return p.id;
  };
  const pomada = await product("Pomada modeladora", "sale", 4500, 5, 2);
  const oleo = await product("Óleo para barba", "sale", 3990, 3, 9);
  const cerveja = await product("Cerveja long neck", "sale", 1200, 12, 25);
  await product("Lâmina descartável (cx)", "internal", null, 2, 1);
  await product("Shampoo 1L", "internal", null, 1, 3);

  // clients
  const client = async (name: string, phone: string, notes = "") => (await run(owner, (tx) => createClientCmd(tx, owner, { name, phone, notes, at: t(-72) }))).id;
  const andre = await client("André Souza", "11988881111", "Corte baixo nas laterais, máquina 1.");
  const marcos = await client("Marcos Lima", "11977772222");
  const pedro = await client("Pedro Alves", "11966663333", "Prefere o Rafael.");
  const lucas = await client("Lucas Rocha", "11955554444");

  // the register opens at 09:00 with R$ 100,00 for change
  await run(owner, (tx) => openRegisterCmd(tx, owner, { openingCash: 10000, at: t(9) }));

  const add = (ctx: TenantContext, comandaId: string, kind: "service" | "product", refId: string, hour: number, barberId = ctx.userId) =>
    run(ctx, (tx) => addItemCmd(tx, ctx, comandaId, { kind, refId, quantity: 1, barberId, at: t(hour) }));
  const open = (ctx: TenantContext, hour: number, over: { clientId?: string; appointment?: { at: Date; barberId: string } } = {}) =>
    run(ctx, (tx) => openComandaCmd(tx, ctx, { at: t(hour), ...over }));
  const pay = (ctx: TenantContext, comandaId: string, method: "cash" | "pix" | "credit", hour: number) =>
    run(ctx, (tx) => closeComandaCmd(tx, ctx, comandaId, { method, at: t(hour) }));

  // this morning: three paid comandas
  const c1 = await open(rafael, 9.1, { clientId: pedro });
  await add(rafael, c1.id, "service", corteBarba, 9.2);
  await add(rafael, c1.id, "product", oleo, 9.2);
  await pay(rafael, c1.id, "credit", 9.4);
  const c2 = await open(diego, 9.2);
  await add(diego, c2.id, "service", barba, 9.3);
  await add(diego, c2.id, "product", cerveja, 9.3);
  await pay(diego, c2.id, "cash", 9.45);
  const c3 = await open(owner, 9.5, { clientId: marcos });
  await add(owner, c3.id, "service", corte, 9.6, ownerId);
  await add(owner, c3.id, "service", sobrancelha, 9.6, ownerId);
  await pay(owner, c3.id, "pix", 9.95);
  await run(owner, (tx) => recordExpenseCmd(tx, owner, { amount: 1850, method: "cash", description: "café e açúcar", at: t(10.3) }));

  // open right now (10:35)
  const walkIn = await open(diego, 10.25);
  await add(diego, walkIn.id, "service", corte, 10.3);
  const pedroOpen = await open(rafael, 10.5, { clientId: pedro });
  await add(rafael, pedroOpen.id, "service", corteBarba, 10.55);
  await add(rafael, pedroOpen.id, "product", pomada, 10.55);

  // appointments (opened yesterday evening / this morning): today 10:00, 11:00 and 15:00; tomorrow 10:00 and 11:30
  const apt = (ctx: TenantContext, openedAt: number, clientId: string, barberId: string, when: number) =>
    open(ctx, openedAt, { clientId, appointment: { at: t(when), barberId } });
  const marcos10 = await apt(owner, -6.7, marcos, rafaelId, 10);
  await add(owner, marcos10.id, "service", corte, -6.6, rafaelId);
  await apt(owner, -5.8, andre, rafaelId, 11);
  const lucas15 = await apt(owner, -6.2, lucas, diegoId, 15);
  await add(owner, lucas15.id, "service", corte, -6.1, diegoId);
  const pedroTomorrow = await apt(rafael, 9.8, pedro, rafaelId, 24 + 10);
  await add(rafael, pedroTomorrow.id, "service", corteBarba, 9.85);
  await apt(owner, 10.1, marcos, diegoId, 24 + 11.5);

  // a client who booked for 09:30 and did not come (marked by the barber)
  const faltou = await apt(owner, -7, andre, diegoId, 9.5);
  await add(owner, faltou.id, "service", barba, -6.9, diegoId);
  await run(diego, (tx) => markNoShowCmd(tx, diego, faltou.id, t(9.9)));

  return { barbershopId, owner, rafael, diego, ids: { rafaelId, diegoId, brunoId, corte, barba, pomada, oleo, cerveja, marcos, andre, pedro, lucas }, day, DAY_MS };
}
