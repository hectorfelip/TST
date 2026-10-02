/**
 * One user action = ONE transaction that is all-or-nothing, INCLUDING when a rule refuses halfway.
 *
 * Example: "pay with discount" saves the discount, then the payment is refused (the register is closed).
 * Without this, the discount would stay saved. Here a refusal rolls everything back.
 */
import type { Pool } from "pg";
import type { DomainError, Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { withTenant, type Tx } from "./client";
import { runOnce } from "./idempotency";

class Refused extends Error {
  constructor(readonly error: DomainError) {
    super(error.message);
  }
}

export type Done<T> = { value: T; replayed: boolean };

export async function atomically<T>(
  pool: Pool,
  ctx: TenantContext,
  idempotency: { key: string | null | undefined; action: string } | undefined,
  fn: (tx: Tx) => Promise<Result<T>>,
): Promise<Result<Done<T>>> {
  try {
    return await withTenant(pool, ctx, async (tx) => {
      if (idempotency) {
        const once = await runOnce(tx, ctx, idempotency.key, idempotency.action, () => fn(tx));
        if (!once.ok) throw new Refused(once.error);
        return { ok: true as const, value: { value: once.value.value, replayed: once.value.replayed } };
      }
      const result = await fn(tx);
      if (!result.ok) throw new Refused(result.error);
      return { ok: true as const, value: { value: result.value, replayed: false } };
    });
  } catch (error) {
    // withTenant already rolled back; the refusal becomes an ordinary answer.
    if (error instanceof Refused) return { ok: false, error: error.error };
    throw error;
  }
}
