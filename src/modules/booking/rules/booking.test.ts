import { describe, expect, it } from "vitest";
import type { Client } from "@/modules/clients/rules/clients";
import type { Service } from "@/modules/services/rules/catalog";
import type { Comanda } from "@/modules/service-orders/rules/comanda";
import { expectError, intruder, NOW as FIXTURE_NOW, owner, rafael } from "@/test/fixtures";
import { zonedTime } from "@/shared/time";
import { approveBooking, declineBooking, MAX_BOOKINGS_PER_ADDRESS_PER_HOUR, MAX_OPEN_BOOKINGS_PER_PHONE, planBooking, type BookingRequest } from "./booking";
import { DEFAULT_BOOKING_SETTINGS } from "./settings";
import type { Candidate } from "./slots";

const TZ = "America/Sao_Paulo";
const NOW = new Date("2026-10-14T12:00:00Z");
const settings = { ...DEFAULT_BOOKING_SETTINGS, enabled: true, slug: "barbearia-exemplo" };
const service: Service = { id: "s1", barbershopId: "shop-1", name: "Corte", price: 4500, durationMinutes: 30, favorite: true, active: true };
const candidates: Candidate[] = [
  { id: "b1", name: "Rafael", busy: [], bookingsThatDay: 2 },
  { id: "b2", name: "Diego", busy: [], bookingsThatDay: 0 },
];
const request: BookingRequest = {
  serviceId: "s1", barberId: "any", startsAt: zonedTime("2026-10-15", "10:00", TZ) as Date, ymd: "2026-10-15",
  name: "  João   da Silva ", phone: "(11) 98888-1111", honeypot: "",
};
const base: Parameters<typeof planBooking>[0] = { request, now: NOW, timeZone: TZ, settings, service, candidates, existingClient: null, throttle: { openForPhone: 0, fromAddressLastHour: 0, forShopLastHour: 0 } };
const plan = (over: Partial<Parameters<typeof planBooking>[0]> = {}) => planBooking({ ...base, ...over });

describe("planBooking", () => {
  it("accepts a good request: tidy name, normalised phone, 'any' picks the barber with fewer bookings, confirmed at once", () => {
    const r = plan();
    expect(r.ok && r.value).toMatchObject({ barber: { id: "b2" }, status: "confirmed", minutes: 30, client: { name: "João da Silva", phone: "11988881111" } });
  });

  it("with the approval option ON the booking waits", () => {
    const r = plan({ settings: { ...settings, requiresApproval: true } });
    expect(r.ok && r.value.status).toBe("pending");
  });

  it("a chosen barber is respected, and refused if he is busy at that time", () => {
    expect(plan({ request: { ...request, barberId: "b1" } }).ok).toBe(true);
    const busy = [{ start: request.startsAt, end: new Date(request.startsAt.getTime() + 30 * 60000) }];
    expectError(plan({ request: { ...request, barberId: "b1" }, candidates: [{ ...candidates[0], busy }, candidates[1]] }), "INVALID_STATE");
    expectError(plan({ request: { ...request, barberId: "nobody" } }), "INVALID_STATE");
  });

  it("an existing client (same phone) is reused, not overwritten", () => {
    const existing = { id: "c1", barbershopId: "shop-1", name: "Marcos Lima", phone: "11988881111", notes: null, createdAt: FIXTURE_NOW, anonymizedAt: null } as Client;
    const r = plan({ existingClient: existing });
    expect(r.ok && r.value.client).toEqual({ existing });
  });

  it("an erased (LGPD) client cannot be used", () => {
    const erased = { id: "c1", barbershopId: "shop-1", name: "Cliente removido", phone: null, notes: null, createdAt: FIXTURE_NOW, anonymizedAt: FIXTURE_NOW } as Client;
    expectError(plan({ existingClient: erased }), "NOT_ALLOWED");
  });

  it("the hidden field catches robots", () => {
    expectError(plan({ request: { ...request, honeypot: "http://spam" } }), "INVALID_INPUT");
  });

  it.each([
    ["no name", { name: " " }],
    ["a name of one letter", { name: "J" }],
    ["no phone", { phone: "" }],
    ["a wrong phone", { phone: "123" }],
  ])("refuses %s", (_, change) => {
    expectError(plan({ request: { ...request, ...change } }), "INVALID_INPUT");
  });

  it("refuses a time that is not a real free slot: before opening, Sunday, the past, too soon", () => {
    for (const [ymd, hhmm] of [["2026-10-15", "07:00"], ["2026-10-18", "10:00"], ["2026-10-10", "10:00"], ["2026-10-14", "09:30"], ["2026-12-20", "10:00"]]) {
      expectError(plan({ request: { ...request, ymd, startsAt: zonedTime(ymd, hhmm, TZ) as Date } }), "INVALID_INPUT");
    }
  });

  it("the link switched OFF, an inactive or missing service are refused", () => {
    expectError(plan({ settings: { ...settings, enabled: false } }), "NOT_ALLOWED");
    expectError(plan({ service: { ...service, active: false } }), "INVALID_INPUT");
    expectError(plan({ service: null }), "INVALID_INPUT");
  });

  it("limits: per phone, per address, per barbershop", () => {
    expectError(plan({ throttle: { openForPhone: MAX_OPEN_BOOKINGS_PER_PHONE, fromAddressLastHour: 0, forShopLastHour: 0 } }), "NOT_ALLOWED");
    expectError(plan({ throttle: { openForPhone: 0, fromAddressLastHour: MAX_BOOKINGS_PER_ADDRESS_PER_HOUR, forShopLastHour: 0 } }), "NOT_ALLOWED");
    expectError(plan({ throttle: { openForPhone: 0, fromAddressLastHour: 0, forShopLastHour: 40 } }), "NOT_ALLOWED");
    expect(plan({ throttle: { openForPhone: MAX_OPEN_BOOKINGS_PER_PHONE - 1, fromAddressLastHour: MAX_BOOKINGS_PER_ADDRESS_PER_HOUR - 1, forShopLastHour: 39 } }).ok).toBe(true);
  });
});

function pending(over: Partial<Comanda> = {}): Comanda {
  return {
    id: "k1", barbershopId: "shop-1", number: 7, clientId: "c1", openedBy: "barber-1", openedAt: NOW, status: "open", items: [], removedItems: [],
    discount: null, payment: null, note: null, appointment: { at: new Date("2026-10-15T13:00:00Z"), barberId: "barber-1" }, pendingSince: null, noShow: null,
    closedAt: null, closedBy: null, cancellation: null, online: { status: "pending" }, appointmentMinutes: 30, ...over,
  } as Comanda;
}

describe("approve and decline", () => {
  it("the owner or the barber of the booking approves: it becomes confirmed, audited", () => {
    const byOwner = approveBooking(owner, pending({ barbershopId: owner.barbershopId }), NOW);
    expect(byOwner.ok && byOwner.value.comanda.online).toEqual({ status: "confirmed" });
    const mine = pending({ barbershopId: rafael.barbershopId, appointment: { at: NOW, barberId: rafael.userId } });
    const byBarber = approveBooking(rafael, mine, NOW);
    expect(byBarber.ok && byBarber.value.audit.action).toBe("booking.approved");
  });

  it("another barber, another barbershop, or a booking that is not waiting: refused", () => {
    expectError(approveBooking(rafael, pending({ barbershopId: rafael.barbershopId }), NOW), "FORBIDDEN"); // booked with someone else
    expectError(approveBooking(intruder, pending({ barbershopId: owner.barbershopId }), NOW), "FORBIDDEN");
    expectError(approveBooking(owner, pending({ barbershopId: owner.barbershopId, online: { status: "confirmed" } }), NOW), "INVALID_STATE");
    expectError(approveBooking(owner, pending({ barbershopId: owner.barbershopId, online: null }), NOW), "INVALID_STATE");
    expectError(approveBooking(owner, pending({ barbershopId: owner.barbershopId, status: "closed" }), NOW), "INVALID_STATE");
  });

  it("declining needs a reason and cancels it with the team member's name", () => {
    const c = pending({ barbershopId: owner.barbershopId });
    expectError(declineBooking(owner, c, "  ", NOW), "INVALID_INPUT");
    const done = declineBooking(owner, c, "Barbeiro de folga", NOW);
    expect(done.ok && done.value.comanda).toMatchObject({ status: "cancelled", cancellation: { reason: "Recusado: Barbeiro de folga", by: owner.userId } });
    expectError(declineBooking(rafael, c, "Barbeiro de folga", NOW), "FORBIDDEN");
  });
});
