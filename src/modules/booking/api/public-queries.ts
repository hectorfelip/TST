import "server-only";
/**
 * Reading for the PUBLIC page (nobody is logged in). The only thing that identifies the barbershop is the address in the link,
 * looked up by a database function that finds ONLY barbershops whose link is ON. After that the page reads as a "public visitor"
 * of that barbershop: the same Row Level Security applies, and only what the page shows is returned (no phones, no clients).
 */
import { withPublic, withTenant } from "@/db/client";
import { appPool } from "@/server/db";
import { listServices } from "@/modules/services/data/services.repo";
import { addDaysYmd, localYmd, isValidYmd, weekdayOfYmd, ymdTitle } from "@/shared/time";
import type { Cents } from "@/shared/money";
import { freeSlots } from "../data/availability";
import { listBookableBarbers } from "../data/booking.repo";
import { lookupShopBySlug } from "../data/settings.repo";
import { isOpenOn } from "../rules/settings";
import { BOOKING_HORIZON_DAYS } from "../rules/slots";

/** Nobody is logged in: the public visitor has this id (it matches no employee). */
export const PUBLIC_USER_ID = "00000000-0000-0000-0000-000000000000";

export type PublicService = { id: string; name: string; price: Cents; durationMinutes: number };
export type PublicDay = { ymd: string; title: string };

export type PublicBookingPage = {
  shopName: string;
  requiresApproval: boolean;
  services: PublicService[];
  barbers: { id: string; name: string }[];
  /** What the visitor already chose (only values that really exist; anything else in the link is ignored). */
  service: PublicService | null;
  barber: { id: string; name: string } | null; // id "any" = anybody
  days: PublicDay[];
  day: PublicDay | null;
  slots: string[];
  time: string | null;
};

export type PublicChoice = { service?: string; barber?: string; day?: string; time?: string };

export async function loadPublicBooking(slug: string, choice: PublicChoice): Promise<PublicBookingPage | null> {
  const pool = await appPool();
  const shop = await withPublic(pool, (tx) => lookupShopBySlug(tx, slug));
  if (!shop) return null;
  return withTenant(pool, { barbershopId: shop.barbershopId, userId: PUBLIC_USER_ID }, async (tx) => {
    const now = new Date();
    const services: PublicService[] = (await listServices(tx))
      .filter((s) => s.active)
      .map((s) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.durationMinutes }));
    const barbers = await listBookableBarbers(tx);

    const service = services.find((s) => s.id === choice.service) ?? null;
    const barber = choice.barber === "any" ? { id: "any", name: "Qualquer barbeiro" } : (barbers.find((b) => b.id === choice.barber) ?? null);

    const today = localYmd(now, shop.timeZone);
    const days: PublicDay[] = [];
    for (let i = 0; i <= BOOKING_HORIZON_DAYS; i++) {
      const ymd = addDaysYmd(today, i);
      if (isOpenOn(shop.settings.openDays, weekdayOfYmd(ymd))) days.push({ ymd, title: i === 0 ? `Hoje · ${ymdTitle(ymd).split(", ")[1]}` : i === 1 ? `Amanhã · ${ymdTitle(ymd).split(", ")[1]}` : ymdTitle(ymd) });
    }
    const day = choice.day && isValidYmd(choice.day) ? (days.find((d) => d.ymd === choice.day) ?? null) : null;

    let slots: string[] = [];
    if (service && barber && day) {
      slots = (await freeSlots(tx, { ymd: day.ymd, timeZone: shop.timeZone, now, settings: shop.settings, service: { ...service, barbershopId: shop.barbershopId, favorite: false, active: true }, barberId: barber.id })).map((s) => s.time);
    }
    const time = choice.time && slots.includes(choice.time) ? choice.time : null;
    return { shopName: shop.name, requiresApproval: shop.settings.requiresApproval, services, barbers, service, barber, days, day, slots, time };
  });
}
