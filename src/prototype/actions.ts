"use server";

import { cookies } from "next/headers";
import { DEFAULT_SETTINGS, validateSettings } from "@/modules/barbershops/rules/settings";
import { DEMO_PENDING_COOKIE } from "./demo-settings";
import { DEMO_ROLE_COOKIE } from "./demo-role";

export async function switchDemoRole(formData: FormData) {
  const role = formData.get("role") === "barber" ? "barber" : "owner";
  const cookieStore = await cookies();
  cookieStore.set(DEMO_ROLE_COOKIE, role, { sameSite: "lax", httpOnly: true });
}

export async function savePendingSettings(enabled: boolean, days: number): Promise<{ ok: boolean; message: string }> {
  const valid = validateSettings({ ...DEFAULT_SETTINGS, autoCancelPending: enabled, pendingExpiryDays: days });
  if (!valid.ok) return { ok: false, message: valid.error.message };
  const cookieStore = await cookies();
  cookieStore.set(DEMO_PENDING_COOKIE, `${enabled ? "on" : "off"}:${days}`, { sameSite: "lax", httpOnly: true });
  return { ok: true, message: "Salvo." };
}
