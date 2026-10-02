import "server-only";
/**
 * Who is logged in, and what may they do. This is the ONLY place that builds a TenantContext for a request.
 *
 * Rules of this file:
 *  - the cookie only says WHO. Role, barbershop and "is still active" are read from the database
 *    on EVERY request: an owner who deactivates or demotes a person has effect immediately;
 *  - a session made before the last password change is refused;
 *  - nothing here accepts a barbershop id, a role or a price from the browser.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withPublic } from "@/db/client";
import { lookupSessionUser } from "@/modules/auth/data/login";
import { can, type Action } from "@/modules/auth/rules/permissions";
import type { TenantContext } from "@/shared/tenant";
import { appPool } from "./db";
import { assertSecret, createSessionToken, readSessionToken, SESSION_MAX_AGE_SECONDS } from "./session-token";

export const SESSION_COOKIE = "session";

export type Auth = { ctx: TenantContext; name: string };

const secret = () => assertSecret(process.env.SESSION_SECRET);

/** Cached for the duration of ONE request: many components can ask without hitting the database each time. */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const token = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value, secret());
  if (!token) return null;
  const user = await withPublic(await appPool(), (tx) => lookupSessionUser(tx, token.employeeId));
  if (!user) return null; // deactivated or removed
  if (token.issuedAt < user.passwordChangedAt.getTime()) return null; // the password was changed after this login
  return { ctx: { barbershopId: user.barbershopId, userId: user.employeeId, role: user.role }, name: user.name };
});

/** For pages: no valid session = go to the login screen. */
export async function requireAuth(): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}

/** For pages that only some roles may open. Returns null (the page shows "no access") instead of throwing. */
export async function requireAction(action: Action): Promise<Auth | null> {
  const auth = await requireAuth();
  return can(auth.ctx.role, action) ? auth : null;
}

export async function startSession(employeeId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(employeeId, secret()), {
    httpOnly: true, // JavaScript in the page cannot read it
    secure: process.env.NODE_ENV === "production", // only over https when online
    sameSite: "lax", // not sent on requests started by other sites
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
