/**
 * Online booking commands. Same pattern as every other command: lock, load, ask the rule, save everything together.
 * The public booking runs for a barbershop with NO logged-in person: it "acts" as the barber who gets the appointment
 * (a barber may book his own agenda), so the rules of the comanda stay the very same ones.
 */
import { randomUUID } from "node:crypto";
import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { guarded } from "@/db/errors";
import { getSettings as getShopSettings, lockBarbershop } from "@/modules/barbershops/data/settings.repo";
import { findByPhone, insertClient } from "@/modules/clients/data/clients.repo";
import { createClient, normalizePhone } from "@/modules/clients/rules/clients";
import { getService } from "@/modules/services/data/services.repo";
import { getComanda, insertComanda, nextComandaNumber, saveComanda } from "@/modules/service-orders/data/comandas.repo";
import { addItem, openComanda, type BarberRef } from "@/modules/service-orders/rules/comanda";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { zonedTime } from "@/shared/time";
import { approveBooking, declineBooking, planBooking, type BookingRequest } from "../rules/booking";
import { updateBookingSettings, type BookingSettings } from "../rules/settings";
import { loadCandidates } from "./availability";
import { countFromAddressSince, countOnlineForShopSince, countOpenOnlineForClient, HOUR_MS, setTakesOnline } from "./booking.repo";
import { getBookingSettings, saveBookingSettings } from "./settings.repo";
import { requirePermission } from "@/modules/auth/rules/permissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => fail("WRONG_TENANT", "Registro não encontrado.");

export type BookingConfirmation = { shopName: string; serviceName: string; barberName: string; startsAt: string; status: "pending" | "confirmed" };

/** What the PUBLIC page sends. `startsAt` is rebuilt here from the date and the time: the browser's own instant is never trusted. */
export type PublicBookingInput = {
  serviceId: string;
  barberId: string;
  ymd: string;
  time: string;
  name: string;
  phone: string;
  honeypot: string;
  /** HMAC of the visitor's address: never the address itself. */
  ipHash: string;
  now?: Date;
};

export async function createOnlineBookingCmd(tx: Tx, shopName: string, input: PublicBookingInput): Promise<Result<BookingConfirmation>> {
  const now = input.now ?? new Date();
  // Two people booking the same time at the same instant wait for each other here: the second one sees the first one's booking.
  await lockBarbershop(tx);
  const settings = await getBookingSettings(tx);
  const { timeZone } = await getShopSettings(tx);

  const startsAt = zonedTime(input.ymd, input.time, timeZone);
  if (!startsAt) return fail("INVALID_INPUT", "Data ou horário inválido.");
  if (!UUID.test(input.serviceId) || (input.barberId !== "any" && !UUID.test(input.barberId))) return fail("INVALID_INPUT", "Pedido inválido. Recarregue a página.");

  const service = await getService(tx, input.serviceId);
  const candidates = await loadCandidates(tx, input.ymd, timeZone, settings.slotMinutes);

  const phone = normalizePhone(input.phone);
  const existingClient = phone.ok && phone.value ? await findByPhone(tx, phone.value) : null;
  const request: BookingRequest = {
    serviceId: input.serviceId, barberId: input.barberId, startsAt, ymd: input.ymd, name: input.name, phone: input.phone, honeypot: input.honeypot,
  };
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const plan = planBooking({
    request, now, timeZone, settings, service, candidates, existingClient,
    throttle: {
      openForPhone: existingClient ? await countOpenOnlineForClient(tx, existingClient.id, now) : 0,
      fromAddressLastHour: await countFromAddressSince(tx, input.ipHash, hourAgo),
      forShopLastHour: await countOnlineForShopSince(tx, hourAgo),
    },
  });
  if (!plan.ok) return plan;
  if (!service) return notFound(); // unreachable: the plan refuses without a service (keeps the types honest)

  const barber = plan.value.barber;
  const acting: TenantContext = { barbershopId: service.barbershopId, userId: barber.id, role: "barber" };
  const barberRef: BarberRef = { id: barber.id, barbershopId: service.barbershopId, active: true };

  return guarded(async () => {
    let clientId: string;
    if ("existing" in plan.value.client) clientId = plan.value.client.existing.id;
    else {
      const created = createClient(
        acting,
        { id: randomUUID(), name: plan.value.client.name, phone: plan.value.client.phone, notes: "Cadastrado pelo link de agendamento.", at: now },
        null,
      );
      if (!created.ok) return created;
      await insertClient(tx, created.value);
      clientId = created.value.id;
    }
    const probe = openComanda(acting, {
      id: randomUUID(), number: 1, client: { id: clientId, barbershopId: service.barbershopId, anonymizedAt: null }, at: now,
      appointment: { at: startsAt, barber: barberRef },
    });
    if (!probe.ok) return probe;
    const withItem = addItem(acting, { ...probe.value, number: await nextComandaNumber(tx), online: { status: plan.value.status }, appointmentMinutes: plan.value.minutes }, {
      itemId: randomUUID(), source: { kind: "service", service }, quantity: 1, barber: barberRef, at: now,
    });
    if (!withItem.ok) return withItem;
    await insertComanda(tx, withItem.value, { ipHash: input.ipHash });
    await insertAudit(tx, [
      {
        barbershopId: service.barbershopId, action: "booking.created", userId: "online", at: now, entityId: withItem.value.id,
        details: { number: withItem.value.number, barber: barber.name, service: service.name, status: plan.value.status },
      },
    ]);
    return ok<BookingConfirmation>({ shopName, serviceName: service.name, barberName: barber.name, startsAt: startsAt.toISOString(), status: plan.value.status });
  });
}

export async function approveBookingCmd(tx: Tx, ctx: TenantContext, comandaId: string, at = new Date()): Promise<Result<true>> {
  const comanda = await getComanda(tx, comandaId, { lock: true });
  if (!comanda) return notFound();
  const done = approveBooking(ctx, comanda, at);
  if (!done.ok) return done;
  await saveComanda(tx, done.value.comanda);
  await insertAudit(tx, [done.value.audit]);
  return ok(true);
}

export async function declineBookingCmd(tx: Tx, ctx: TenantContext, comandaId: string, reason: string, at = new Date()): Promise<Result<true>> {
  const comanda = await getComanda(tx, comandaId, { lock: true });
  if (!comanda) return notFound();
  const done = declineBooking(ctx, comanda, reason, at);
  if (!done.ok) return done;
  await saveComanda(tx, done.value.comanda);
  await insertAudit(tx, [done.value.audit]);
  return ok(true);
}

export function saveBookingSettingsCmd(tx: Tx, ctx: TenantContext, next: BookingSettings, at = new Date()): Promise<Result<BookingSettings>> {
  return guarded(async () => {
    await lockBarbershop(tx);
    const result = updateBookingSettings(ctx, await getBookingSettings(tx), next, at);
    if (!result.ok) return result;
    await saveBookingSettings(tx, ctx.barbershopId, result.value.settings);
    await insertAudit(tx, [result.value.audit]);
    return ok(result.value.settings);
  });
}

/** The owner decides who can be chosen on the public page. */
export async function setTakesOnlineCmd(tx: Tx, ctx: TenantContext, employeeId: string, value: boolean): Promise<Result<true>> {
  const allowed = requirePermission(ctx, "employee.manage");
  if (!allowed.ok) return allowed;
  return (await setTakesOnline(tx, employeeId, value)) ? ok(true) : notFound();
}
