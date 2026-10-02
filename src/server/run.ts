import "server-only";
/**
 * The two doors every screen uses to reach the data:
 *   read(fn)  - a query for a page (one transaction, one barbershop);
 *   act(fn)   - an action behind a button (same, plus: permission check, friendly errors, idempotency).
 * Both build the TenantContext themselves from the session. The browser never supplies it.
 */
import { atomically } from "@/db/atomic";
import { withTenant, type Tx } from "@/db/client";
import { requirePermission, type Action } from "@/modules/auth/rules/permissions";
import type { Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { getAuth, requireAuth } from "./auth";
import { appPool } from "./db";
import type { ActionResult } from "./run-types";

export type { ActionResult } from "./run-types";

export async function read<T>(fn: (tx: Tx, ctx: TenantContext) => Promise<T>): Promise<T> {
  const { ctx } = await requireAuth();
  return withTenant(await appPool(), ctx, (tx) => fn(tx, ctx));
}

type ActOptions = {
  /** Checked BEFORE anything runs (the rules check again: two locks). */
  permission?: Action;
  /** Send the browser's key: the same key twice has its effect once (see db/idempotency.ts). */
  idempotency?: { key: string | null | undefined; action: string };
};

export async function act<T = null>(options: ActOptions, fn: (tx: Tx, ctx: TenantContext) => Promise<Result<T>>): Promise<ActionResult<T>> {
  try {
    const auth = await getAuth();
    if (!auth) return { ok: false, code: "UNAUTHENTICATED", message: "Sua sessão acabou. Entre de novo." };
    const { ctx } = auth;
    if (options.permission) {
      const allowed = requirePermission(ctx, options.permission);
      if (!allowed.ok) return { ok: false, code: allowed.error.code, message: allowed.error.message };
    }
    const done = await atomically(await appPool(), ctx, options.idempotency, (tx) => fn(tx, ctx));
    return done.ok ? { ok: true, value: done.value.value, replayed: done.value.replayed } : { ok: false, code: done.error.code, message: done.error.message };
  } catch (error) {
    // Something we did not foresee. The details go to the server log, never to the screen.
    console.error("[action] unexpected error:", error);
    return { ok: false, code: "UNEXPECTED", message: "Algo deu errado. Nada foi salvo. Tente de novo; se continuar, avise o suporte." };
  }
}
