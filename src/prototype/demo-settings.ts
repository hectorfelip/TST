/**
 * PROTOTYPE ONLY. Keeps the owner's "pending comandas" option in a cookie so
 * the demo screens react to the Configurações screen. The real settings live
 * in the database (step 4) and follow src/modules/barbershops/rules/settings.ts.
 */
import { cookies } from "next/headers";
import { DEFAULT_SETTINGS, pendingExpiry } from "@/modules/barbershops/rules/settings";

export const DEMO_PENDING_COOKIE = "demo_pending";

export type DemoPending = { enabled: boolean; days: number };

export function parseDemoPending(raw: string | undefined): DemoPending {
  const [flag, daysText] = (raw ?? "").split(":");
  const days = Number(daysText);
  return {
    enabled: flag === "off" ? false : DEFAULT_SETTINGS.autoCancelPending,
    days: Number.isInteger(days) && days >= 1 && days <= 30 ? days : DEFAULT_SETTINGS.pendingExpiryDays,
  };
}

export async function getDemoPending(): Promise<DemoPending> {
  return parseDemoPending((await cookies()).get(DEMO_PENDING_COOKIE)?.value);
}

/** Days a pending comanda lasts, or null when the option is off (see pendingExpiry in the rules). */
export async function getDemoExpiryDays(): Promise<number | null> {
  const { enabled, days } = await getDemoPending();
  return pendingExpiry({ autoCancelPending: enabled, pendingExpiryDays: days });
}
