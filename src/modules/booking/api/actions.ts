"use server";
/**
 * The buttons of the owner/barber side of online booking. Same pattern as every action:
 * read the form, `act` (session + permission + one all-or-nothing transaction + idempotency), call the command.
 */
import { act, type ActionResult } from "@/server/run";
import { text } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { fail, ok } from "@/shared/result";
import { approveBookingCmd, declineBookingCmd, saveBookingSettingsCmd, setTakesOnlineCmd } from "../data/commands";
import { maskFromDays, type BookingSettings } from "../rules/settings";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });

/** "09:30" -> 570. Anything else -> null. */
function minutesOf(raw: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Only the owner. "00:00" as the closing time means midnight (the end of the day). */
export async function saveBookingSettingsAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "settings.manage", idempotency: idem(formData, "booking.settings") }, async (tx, ctx) => {
    const open = minutesOf(text(formData, "open"));
    const closeRaw = minutesOf(text(formData, "close"));
    if (open === null || closeRaw === null) return fail("INVALID_INPUT", "Informe os horários de abrir e fechar, ex.: 09:00.");
    const next: BookingSettings = {
      enabled: text(formData, "enabled") === "yes",
      slug: text(formData, "slug").trim() === "" ? null : text(formData, "slug"),
      requiresApproval: text(formData, "approval") === "yes",
      openDays: maskFromDays(formData.getAll("day").map((d) => Number(d))),
      openMinute: open,
      closeMinute: closeRaw === 0 ? 24 * 60 : closeRaw,
      slotMinutes: Number(text(formData, "slot")),
      minNoticeMinutes: Number(text(formData, "notice")),
    };
    const saved = await saveBookingSettingsCmd(tx, ctx, next);
    return saved.ok ? ok(null) : saved;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** The owner decides who can be chosen on the public page. */
export async function setTakesOnlineAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "employee.manage", idempotency: idem(formData, "booking.takes_online") }, async (tx, ctx) => {
    const done = await setTakesOnlineCmd(tx, ctx, text(formData, "employeeId"), text(formData, "value") === "yes");
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** The owner, or the barber the client booked with. */
export async function approveBookingAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: idem(formData, "booking.approve") }, async (tx, ctx) => {
    const done = await approveBookingCmd(tx, ctx, text(formData, "comandaId"));
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** Needs a reason (saved with the person's name). The time becomes free again. */
export async function declineBookingAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: idem(formData, "booking.decline") }, async (tx, ctx) => {
    const done = await declineBookingCmd(tx, ctx, text(formData, "comandaId"), text(formData, "reason"));
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}
