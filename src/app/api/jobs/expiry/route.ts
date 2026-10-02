import { timingSafeEqual } from "node:crypto";
import { runExpiryJob } from "@/modules/service-orders/data/jobs";
import { adminPool, appPool } from "@/server/db";

/**
 * The daily job. A scheduler (Vercel Cron, GitHub Actions, cron + curl...) calls it once a day:
 *   GET /api/jobs/expiry      Authorization: Bearer <CRON_SECRET>
 *
 *  - cancels the pending comandas that passed their barbershop's deadline (only barbershops that kept the option on);
 *  - forgets idempotency keys older than 30 days.
 * Safe to call twice: the second call finds nothing to do.
 * It is the ONLY place that uses the owner connection while the app runs, because it must look at every barbershop.
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
    const admin = adminPool();
    const result = await runExpiryJob(await appPool(), admin, new Date());
    const cleaned = await admin.query("DELETE FROM idempotency_keys WHERE created_at < now() - interval '30 days'");
    return Response.json({ ...result, forgottenKeys: cleaned.rowCount ?? 0 });
  } catch (error) {
    console.error("[job] expiry failed:", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
