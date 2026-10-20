import type { Tx } from "@/db/client";
import { DEFAULT_BOOKING_SETTINGS, type BookingSettings } from "../rules/settings";

type Row = {
  enabled: boolean; slug: string | null; requires_approval: boolean; open_days: number; open_minute: number; close_minute: number;
  slot_minutes: number; min_notice_minutes: number;
};

const toSettings = (r: Row): BookingSettings => ({
  enabled: r.enabled, slug: r.slug, requiresApproval: r.requires_approval, openDays: r.open_days, openMinute: r.open_minute,
  closeMinute: r.close_minute, slotMinutes: r.slot_minutes, minNoticeMinutes: r.min_notice_minutes,
});

/** The settings of the current barbershop; a barbershop that never set them gets the defaults (link OFF). */
export async function getBookingSettings(tx: Tx): Promise<BookingSettings> {
  const row = await tx.maybeOne<Row>(
    "SELECT enabled, slug, requires_approval, open_days, open_minute, close_minute, slot_minutes, min_notice_minutes FROM booking_settings",
  );
  return row ? toSettings(row) : DEFAULT_BOOKING_SETTINGS;
}

export async function saveBookingSettings(tx: Tx, barbershopId: string, s: BookingSettings): Promise<void> {
  await tx.query(
    `INSERT INTO booking_settings (barbershop_id, enabled, slug, requires_approval, open_days, open_minute, close_minute, slot_minutes, min_notice_minutes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (barbershop_id) DO UPDATE SET enabled = EXCLUDED.enabled, slug = EXCLUDED.slug, requires_approval = EXCLUDED.requires_approval,
       open_days = EXCLUDED.open_days, open_minute = EXCLUDED.open_minute, close_minute = EXCLUDED.close_minute,
       slot_minutes = EXCLUDED.slot_minutes, min_notice_minutes = EXCLUDED.min_notice_minutes, updated_at = now()`,
    [barbershopId, s.enabled, s.slug, s.requiresApproval, s.openDays, s.openMinute, s.closeMinute, s.slotMinutes, s.minNoticeMinutes],
  );
}

export type PublicShop = { barbershopId: string; name: string; timeZone: string; settings: BookingSettings };

/**
 * The public page: from the address to the barbershop. Runs with NO barbershop set (nobody is logged in) through a database
 * function that only finds barbershops whose link is ON, and returns just what the page needs.
 */
export async function lookupShopBySlug(tx: Tx, slug: string): Promise<PublicShop | null> {
  const r = await tx.maybeOne<Row & { barbershop_id: string; name: string; time_zone: string }>("SELECT * FROM booking_shop_by_slug($1)", [slug]);
  if (!r) return null;
  return { barbershopId: r.barbershop_id, name: r.name, timeZone: r.time_zone, settings: toSettings({ ...r, enabled: true, slug: slug.trim().toLowerCase() }) };
}
