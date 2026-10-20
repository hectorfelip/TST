/**
 * Online booking: what the PUBLIC page may ask for, and everything the server checks before accepting.
 * Nobody is logged in here, so nothing from the browser is trusted: the time must be a real free slot,
 * the person is limited (per phone, per address, per barbershop) and a hidden field catches simple robots.
 */
import { can } from "@/modules/auth/rules/permissions";
import { normalizePhone, type Client } from "@/modules/clients/rules/clients";
import type { Service } from "@/modules/services/rules/catalog";
import type { Comanda } from "@/modules/service-orders/rules/comanda";
import type { AuditEntry } from "@/shared/audit";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { isValidReason } from "@/shared/text";
import { isFree, pickAnyBarber, withinOpening, type Candidate } from "./slots";
import type { BookingSettings } from "./settings";

export const MAX_OPEN_BOOKINGS_PER_PHONE = 3;
export const MAX_BOOKINGS_PER_ADDRESS_PER_HOUR = 5;
export const MAX_BOOKINGS_PER_SHOP_PER_HOUR = 40;

export type BookingRequest = {
  serviceId: string;
  /** A barber id, or "any". */
  barberId: string;
  startsAt: Date;
  /** The local date of `startsAt` in the barbershop's time zone ("2026-10-14"). */
  ymd: string;
  name: string;
  phone: string;
  /** A field real people never see or fill. */
  honeypot: string;
};

export type Throttle = {
  /** Online bookings of this phone that are still open and in the future. */
  openForPhone: number;
  /** Online bookings made from this address (hashed) in the last hour. */
  fromAddressLastHour: number;
  /** Online bookings of the whole barbershop in the last hour. */
  forShopLastHour: number;
};

export type BookingPlan = {
  barber: Candidate;
  status: "pending" | "confirmed";
  minutes: number;
  /** The client: an existing one (same phone) is reused and NEVER changed or shown; otherwise a new one is registered. */
  client: { existing: Client } | { name: string; phone: string };
};

const TOO_MANY = "Muitos agendamentos em pouco tempo. Tente de novo mais tarde ou ligue para a barbearia.";

export function planBooking(input: {
  request: BookingRequest;
  now: Date;
  timeZone: string;
  settings: BookingSettings;
  service: Service | null;
  candidates: readonly Candidate[];
  existingClient: Client | null;
  throttle: Throttle;
}): Result<BookingPlan> {
  const { request, now, timeZone, settings, service, candidates, existingClient, throttle } = input;
  // A robot filled the hidden field: pretend everything is fine for it? No: refuse with a plain message and save nothing.
  if (request.honeypot.trim() !== "") return fail("INVALID_INPUT", "Não foi possível concluir o agendamento.");
  if (!settings.enabled) return fail("NOT_ALLOWED", "Este link de agendamento está desligado.");
  if (!service || !service.active) return fail("INVALID_INPUT", "Serviço indisponível. Escolha outro.");

  const name = request.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return fail("INVALID_INPUT", "Informe o seu nome (de 2 a 80 caracteres).");
  const phone = normalizePhone(request.phone);
  if (!phone.ok) return phone;
  if (phone.value === null) return fail("INVALID_INPUT", "Informe o seu telefone com DDD, ex.: (11) 98888-1111.");

  if (throttle.fromAddressLastHour >= MAX_BOOKINGS_PER_ADDRESS_PER_HOUR || throttle.forShopLastHour >= MAX_BOOKINGS_PER_SHOP_PER_HOUR) {
    return fail("NOT_ALLOWED", TOO_MANY);
  }
  if (throttle.openForPhone >= MAX_OPEN_BOOKINGS_PER_PHONE) {
    return fail("NOT_ALLOWED", `Este telefone já tem ${MAX_OPEN_BOOKINGS_PER_PHONE} agendamentos em aberto. Compareça ou ligue para a barbearia para mudar.`);
  }
  if (existingClient?.anonymizedAt) return fail("NOT_ALLOWED", "Não foi possível usar este telefone. Ligue para a barbearia.");

  const minutes = service.durationMinutes;
  if (!withinOpening({ startsAt: request.startsAt, ymd: request.ymd, timeZone, now, rules: settings, durationMinutes: minutes })) {
    return fail("INVALID_INPUT", "Esse horário não está disponível. Escolha outro.");
  }
  const free = candidates.filter((c) => isFree(c, request.startsAt, minutes));
  let barber: Candidate | null;
  if (request.barberId === "any") barber = pickAnyBarber(free);
  else barber = free.find((c) => c.id === request.barberId) ?? null;
  if (!barber) return fail("INVALID_STATE", "Esse horário acabou de ser ocupado. Escolha outro.");

  return ok({
    barber,
    status: settings.requiresApproval ? "pending" : "confirmed",
    minutes,
    client: existingClient ? { existing: existingClient } : { name, phone: phone.value },
  });
}

/** The team side: who may approve or decline an online booking: the owner, or the barber it was booked with. */
function canManage(ctx: TenantContext, comanda: Comanda): boolean {
  if (comanda.barbershopId !== ctx.barbershopId) return false;
  return can(ctx.role, "comanda.edit_any") || comanda.appointment?.barberId === ctx.userId;
}

function awaiting(ctx: TenantContext, comanda: Comanda): Result<Comanda> {
  if (!canManage(ctx, comanda)) return fail("FORBIDDEN", "Este agendamento não é seu.");
  if (comanda.status !== "open" || comanda.online?.status !== "pending") return fail("INVALID_STATE", "Este agendamento não está aguardando aprovação.");
  return ok(comanda);
}

export function approveBooking(ctx: TenantContext, comanda: Comanda, at: Date): Result<{ comanda: Comanda; audit: AuditEntry }> {
  const ready = awaiting(ctx, comanda);
  if (!ready.ok) return ready;
  return ok({
    comanda: { ...comanda, online: { status: "confirmed" } },
    audit: { barbershopId: ctx.barbershopId, action: "booking.approved", userId: ctx.userId, at, entityId: comanda.id, details: { number: comanda.number } },
  });
}

/** Declining is a cancellation of something that never happened: no money, no stock. The client is told through the barbershop (phone). */
export function declineBooking(ctx: TenantContext, comanda: Comanda, reason: string, at: Date): Result<{ comanda: Comanda; audit: AuditEntry }> {
  const ready = awaiting(ctx, comanda);
  if (!ready.ok) return ready;
  if (!isValidReason(reason)) return fail("INVALID_INPUT", "Escreva o motivo (pelo menos 5 caracteres).");
  const text = `Recusado: ${reason.trim()}`;
  return ok({
    comanda: { ...comanda, status: "cancelled", cancellation: { reason: text, by: ctx.userId, at } },
    audit: { barbershopId: ctx.barbershopId, action: "booking.declined", userId: ctx.userId, at, entityId: comanda.id, details: { number: comanda.number, reason: text } },
  });
}
