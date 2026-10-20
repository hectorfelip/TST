import type { Tx } from "@/db/client";
import type { Service } from "@/modules/services/rules/catalog";
import { addDaysYmd, zonedTime } from "@/shared/time";
import type { BookingSettings } from "../rules/settings";
import { availableSlots, type Candidate, type Slot } from "../rules/slots";
import { busyByBarber, listBookableBarbers } from "./booking.repo";

/** Everybody who can be booked on that local day, with what they already have. Both the public page and the booking itself use this. */
export async function loadCandidates(tx: Tx, ymd: string, timeZone: string, defaultMinutes: number): Promise<Candidate[]> {
  const dayStart = zonedTime(ymd, "00:00", timeZone);
  const dayEnd = zonedTime(addDaysYmd(ymd, 1), "00:00", timeZone);
  if (!dayStart || !dayEnd) return [];
  const barbers = await listBookableBarbers(tx);
  const busy = await busyByBarber(tx, barbers.map((b) => b.id), dayStart, dayEnd, defaultMinutes);
  return barbers.map((b) => ({ id: b.id, name: b.name, busy: busy.get(b.id) ?? [], bookingsThatDay: busy.get(b.id)?.length ?? 0 }));
}

/** The free times to show: of ONE barber, or of anybody ("any"). The booking itself checks again, with the barbershop locked. */
export async function freeSlots(
  tx: Tx,
  input: { ymd: string; timeZone: string; now: Date; settings: BookingSettings; service: Service; barberId: string },
): Promise<Slot[]> {
  const { ymd, timeZone, now, settings, service, barberId } = input;
  const all = await loadCandidates(tx, ymd, timeZone, settings.slotMinutes);
  const candidates = barberId === "any" ? all : all.filter((c) => c.id === barberId);
  return availableSlots({ ymd, timeZone, now, rules: settings, durationMinutes: service.durationMinutes, candidates });
}
