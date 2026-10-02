/**
 * "Do this ONCE, even if the request arrives twice."
 *
 * The browser sends a random key with every payment-like request. A double tap, or a retry after
 * the connection dropped, sends the SAME key. The first request runs and saves the key in the same
 * transaction as its effect (so both exist or neither). The second finds the key and does nothing.
 * Two identical requests at the very same instant wait for each other (advisory lock on the key).
 * A request that FAILS does not save its key: the person can fix the problem and try again.
 */
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import type { Tx } from "./client";

/** `value` is what the first run returned (a small JSON object: an id, a message...), also on a replay. */
export type Once<T> = { replayed: boolean; value: T };

export async function runOnce<T>(
  tx: Tx,
  ctx: TenantContext,
  key: string | null | undefined,
  action: string,
  run: () => Promise<Result<T>>,
): Promise<Result<Once<T>>> {
  if (!key) return fail("INVALID_INPUT", "Pedido sem chave de segurança. Recarregue a página e tente de novo.");
  if (key.length < 8 || key.length > 100) return fail("INVALID_INPUT", "Chave de segurança inválida. Recarregue a página e tente de novo.");
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${ctx.barbershopId}:${key}`]);
  const existing = await tx.maybeOne<{ action: string; result: T }>("SELECT action, result FROM idempotency_keys WHERE barbershop_id = $1 AND key = $2", [ctx.barbershopId, key]);
  if (existing) {
    return existing.action === action
      ? ok({ replayed: true, value: existing.result })
      : fail("INVALID_INPUT", "Esta chave já foi usada em outra ação. Recarregue a página.");
  }
  const result = await run();
  if (!result.ok) return result;
  await tx.query("INSERT INTO idempotency_keys (barbershop_id, key, action, result) VALUES ($1, $2, $3, $4)", [
    ctx.barbershopId,
    key,
    action,
    JSON.stringify(result.value ?? null),
  ]);
  return ok({ replayed: false, value: result.value });
}
