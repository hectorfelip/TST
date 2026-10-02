import { appPool } from "@/server/db";

/**
 * "Is the app alive and can it reach its database?" For the person who deploys it (open it in the browser) and for uptime monitors.
 * It reveals nothing: no data, no host names, no passwords. On failure only a short error code.
 */
export async function GET() {
  try {
    const pool = await appPool();
    await pool.query("SELECT 1");
    return Response.json({ app: "ok", db: "ok" });
  } catch (error) {
    const code = (error as { code?: string }).code ?? "unknown";
    console.error("[health] database check failed:", error);
    return Response.json({ app: "ok", db: "error", code }, { status: 503 });
  }
}
