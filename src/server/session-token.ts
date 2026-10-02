/**
 * The session cookie: "who" + "when it was made" + "when it expires", signed with a secret only the server knows.
 * It is NOT trusted for the role: the role is read from the database on every request (see auth.ts).
 * The signature only proves that WE created this cookie, so nobody can invent or edit one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type SessionToken = { employeeId: string; issuedAt: number; expiresAt: number };

const b64 = (buffer: Buffer | string) => Buffer.from(buffer).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

export function assertSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must have at least 32 characters (generate one with: openssl rand -base64 32).");
  return secret;
}

export function createSessionToken(employeeId: string, secret: string, now: Date = new Date()): string {
  assertSecret(secret);
  const body = b64(JSON.stringify({ e: employeeId, i: now.getTime(), x: now.getTime() + SESSION_MAX_AGE_SECONDS * 1000 }));
  return `${body}.${b64(sign(body, secret))}`;
}

/** null for anything wrong: edited, expired, made with another secret, or not a token at all. Never throws. */
export function readSessionToken(token: string | undefined | null, secret: string, now: Date = new Date()): SessionToken | null {
  if (!token || token.length > 1000) return null;
  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length > 0) return null;
  try {
    const expected = sign(body, secret);
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { e?: unknown; i?: unknown; x?: unknown };
    if (typeof data.e !== "string" || typeof data.i !== "number" || typeof data.x !== "number") return null;
    if (data.x <= now.getTime() || data.i > now.getTime() + 60_000) return null;
    return { employeeId: data.e, issuedAt: data.i, expiresAt: data.x };
  } catch {
    return null;
  }
}
