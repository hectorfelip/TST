/**
 * PROTOTYPE ONLY (step 2). Lets the demo switch between the owner view and
 * the barber view. Real login and permissions come in steps 3 and 5.
 */
import { cookies } from "next/headers";
import type { Role } from "@/shared/tenant";

export const DEMO_ROLE_COOKIE = "demo_role";

/** In barber mode the demo is logged in as Rafael; in owner mode as Carlos. */
export const DEMO_BARBER_ID = "e2";
export const DEMO_OWNER_ID = "e1";

export async function getDemoUserId(): Promise<string> {
  return (await getDemoRole()) === "barber" ? DEMO_BARBER_ID : DEMO_OWNER_ID;
}

export async function getDemoRole(): Promise<Role> {
  const cookieStore = await cookies();
  return cookieStore.get(DEMO_ROLE_COOKIE)?.value === "barber" ? "barber" : "owner";
}
