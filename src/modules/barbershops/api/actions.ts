"use server";
import { act, type ActionResult } from "@/server/run";
import { text, whole } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { ok } from "@/shared/result";
import { updateSettingsCmd } from "../data/commands";
import { getSettings } from "../data/settings.repo";

/** Only the owner. The change is saved with who changed it and "old → new" (audit). */
export async function saveSettingsAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "settings.manage", idempotency: { key: text(formData, "key"), action: "settings.save" } }, async (tx, ctx) => {
    const days = whole(formData, "days", "Prazo");
    if (!days.ok) return days;
    const current = await getSettings(tx);
    const saved = await updateSettingsCmd(tx, ctx, { ...current, autoCancelPending: text(formData, "enabled") === "yes", pendingExpiryDays: days.value });
    return saved.ok ? ok(null) : saved;
  });
  if (result.ok) refreshScreens();
  return result;
}
