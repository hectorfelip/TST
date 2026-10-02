import { timingSafeEqual } from "node:crypto";
import { forgetOldKeys, runExpiryJob } from "@/modules/service-orders/data/jobs";
import { appPool } from "@/server/db";

/**
 * The daily job. A scheduler (Vercel Cron, GitHub Actions, cron + curl...) calls it once a day:
 *   GET /api/jobs/expiry      Authorization: Bearer <CRON_SECRET>
 *
 *  - cancels the pending comandas that passed their barbershop's deadline (only barbershops that kept the option on);
 *  - forgets idempotency keys older than 30 days.
 * Safe to call twice: the second call finds nothing to do. It uses the SAME restricted connection as the screens
 * (two small database functions let it see every barbershop): the owner's password never lives on the server.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const same = given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!secret || secret.length < 20 || !same) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const pool = await appPool();
    const result = await runExpiryJob(pool, new Date());
    return Response.json({ ...result, forgottenKeys: await forgetOldKeys(pool) });
  } catch (error) {
    console.error("[job] expiry failed:", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
