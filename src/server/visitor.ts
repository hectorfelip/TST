import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { assertSecret } from "./session-token";

/**
 * Who is this visitor, WITHOUT keeping who they are: an HMAC (a one-way fingerprint made with our secret) of the address.
 * Used only to limit how many bookings one address can make per hour. The address itself is never stored or logged.
 * On Vercel the platform sets these headers; a visitor cannot choose them.
 */
export async function visitorHash(): Promise<string> {
  const h = await headers();
  const address = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHmac("sha256", assertSecret(process.env.SESSION_SECRET)).update(`visitor:${address}`).digest("hex");
}
