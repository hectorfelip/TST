import "server-only";
/** Reading for the owner's screens: the booking link settings and who accepts online bookings. */
import { getBarbershopName } from "@/modules/barbershops/data/settings.repo";
import { read } from "@/server/run";
import { listServices } from "@/modules/services/data/services.repo";
import { listBookableBarbers, takesOnlineById } from "../data/booking.repo";
import { getBookingSettings } from "../data/settings.repo";
import { suggestSlug, type BookingSettings } from "../rules/settings";

export type BookingSettingsPage = {
  settings: BookingSettings;
  suggestedSlug: string;
  /** For the warning "the link is on but nobody can be booked". */
  bookableBarbers: number;
  activeServices: number;
};

export async function loadBookingSettingsPage(): Promise<BookingSettingsPage> {
  return read(async (tx) => ({
    settings: await getBookingSettings(tx),
    suggestedSlug: suggestSlug(await getBarbershopName(tx)),
    bookableBarbers: (await listBookableBarbers(tx)).length,
    activeServices: (await listServices(tx)).filter((s) => s.active).length,
  }));
}

/** employee id -> accepts online bookings? (for the Team screen) */
export async function loadTakesOnline(): Promise<Record<string, boolean>> {
  return read(async (tx) => Object.fromEntries(await takesOnlineById(tx)));
}
