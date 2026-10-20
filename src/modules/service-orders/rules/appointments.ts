/**
 * The "light agenda": appointments are comandas opened in advance
 * (see `Comanda.appointment`). Barbers see the clients booked with them for
 * today and tomorrow; the owner sees everyone's.
 *
 * The calendar (month grid) is a screen over this same list. Online booking by the client lives in
 * `modules/booking`: it creates these very same comandas.
 *
 * NOT included on purpose (v2): double-booking warnings for appointments typed by the team, and reminders by WhatsApp.
 */
import type { TenantContext } from "@/shared/tenant";
import { canView, type Comanda } from "./comanda";

/**
 * Open appointments in [from, to) that this user may see, earliest first.
 * Use `dayRange` (shared/time) with the barbershop time zone to build the range.
 * A no-show leaves the list (it is no longer "open"), as the owner asked.
 */
export function agendaBetween(ctx: TenantContext, comandas: readonly Comanda[], range: { from: Date; to: Date }): Comanda[] {
  return comandas
    .filter((c) => c.status === "open" && c.appointment !== null)
    .filter((c) => c.appointment!.at.getTime() >= range.from.getTime() && c.appointment!.at.getTime() < range.to.getTime())
    .filter((c) => canView(ctx, c))
    .sort((a, b) => a.appointment!.at.getTime() - b.appointment!.at.getTime());
}

/** How many times this client booked and did not show up (any role can see it). */
export function noShowCount(comandas: readonly Comanda[], clientId: string): number {
  return comandas.filter((c) => c.status === "no_show" && c.clientId === clientId).length;
}
