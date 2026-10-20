"use server";
/**
 * The ONE public action: a visitor books. There is no session. What the browser sends is only: the address of the link,
 * the ids it clicked, the date and time as text, the name and the phone. Everything else (barbershop, price, duration,
 * who is free, limits) is decided on the server, inside the same all-or-nothing transaction as every other action.
 */
import { atomically } from "@/db/atomic";
import { withPublic } from "@/db/client";
import { appPool } from "@/server/db";
import { text } from "@/server/form";
import type { ActionResult } from "@/server/run";
import { visitorHash } from "@/server/visitor";
import { createOnlineBookingCmd, type BookingConfirmation } from "../data/commands";
import { lookupShopBySlug } from "../data/settings.repo";
import { PUBLIC_USER_ID } from "./public-queries";

export async function bookOnlineAction(_previous: unknown, formData: FormData): Promise<ActionResult<BookingConfirmation>> {
  try {
    const pool = await appPool();
    const shop = await withPublic(pool, (tx) => lookupShopBySlug(tx, text(formData, "slug")));
    if (!shop) return { ok: false, code: "NOT_ALLOWED", message: "Este link de agendamento não está disponível." };
    const ipHash = await visitorHash();
    const done = await atomically(
      pool,
      { barbershopId: shop.barbershopId, userId: PUBLIC_USER_ID, role: "barber" },
      { key: text(formData, "key"), action: "booking.online" },
      (tx) =>
        createOnlineBookingCmd(tx, shop.name, {
          serviceId: text(formData, "service"),
          barberId: text(formData, "barber"),
          ymd: text(formData, "day"),
          time: text(formData, "time"),
          name: text(formData, "name"),
          phone: text(formData, "phone"),
          honeypot: text(formData, "website"),
          ipHash,
        }),
    );
    return done.ok ? { ok: true, value: done.value.value, replayed: done.value.replayed } : { ok: false, code: done.error.code, message: done.error.message };
  } catch (error) {
    console.error("[booking] unexpected error:", error);
    return { ok: false, code: "UNEXPECTED", message: "Algo deu errado. Nada foi salvo. Tente de novo; se continuar, ligue para a barbearia." };
  }
}
