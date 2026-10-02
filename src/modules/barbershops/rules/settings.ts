/**
 * Things that change from shop to shop are settings, not fixed code
 * (lesson from step 1: one owner's habits must not become rules for all).
 */
import { requirePermission } from "@/modules/auth/rules/permissions";
import type { AuditEntry } from "@/shared/audit";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { isValidTimeZone } from "@/shared/time";

export type BarbershopSettings = {
  /** A client with no visit for more than this many days is shown as "Sumido". */
  awayAfterDays: number;
  /**
   * OPTION of the barbershop: cancel pending (unpaid) comandas by themselves
   * after `pendingExpiryDays`? Off = they wait until the owner pays or cancels
   * them (the owner is still alerted at every closing).
   */
  autoCancelPending: boolean;
  /** Custom deadline in days. Only used when `autoCancelPending` is on. */
  pendingExpiryDays: number;
  /** IANA time zone of the shop. Decides what "today" and "tomorrow" mean. */
  timeZone: string;
};

export const MIN_PENDING_DAYS = 1;
export const MAX_PENDING_DAYS = 30;

export const DEFAULT_SETTINGS: BarbershopSettings = {
  awayAfterDays: 30,
  autoCancelPending: true,
  pendingExpiryDays: 5,
  timeZone: "America/Sao_Paulo",
};

/**
 * Days a pending comanda lasts, or `null` when the shop turned the automatic
 * cancellation off. Pass this value to the day-close rules.
 */
export function pendingExpiry(settings: Pick<BarbershopSettings, "autoCancelPending" | "pendingExpiryDays">): number | null {
  return settings.autoCancelPending ? settings.pendingExpiryDays : null;
}

export function validateSettings(input: BarbershopSettings): Result<BarbershopSettings> {
  if (!Number.isInteger(input.awayAfterDays) || input.awayAfterDays < 7 || input.awayAfterDays > 365) {
    return fail("INVALID_INPUT", "Dias para cliente sumido deve ser entre 7 e 365.");
  }
  if (typeof input.autoCancelPending !== "boolean") {
    return fail("INVALID_INPUT", "Informe se as comandas pendentes são canceladas automaticamente.");
  }
  // The deadline is validated even when the option is off, so turning it on later never starts with a bad value.
  if (!Number.isInteger(input.pendingExpiryDays) || input.pendingExpiryDays < MIN_PENDING_DAYS || input.pendingExpiryDays > MAX_PENDING_DAYS) {
    return fail("INVALID_INPUT", `O prazo das comandas pendentes deve ser de ${MIN_PENDING_DAYS} a ${MAX_PENDING_DAYS} dias.`);
  }
  if (!isValidTimeZone(input.timeZone)) return fail("INVALID_INPUT", "Fuso horário inválido.");
  return ok(input);
}

/**
 * R-SET-02: only the owner changes the settings. The change is audited with
 * the old and new values. Lowering the deadline (or turning the option on)
 * can cancel comandas that are already pending; the screen must warn him
 * first (see `expirePendingComandas`, which can be used as a preview).
 */
export function updateSettings(
  ctx: TenantContext,
  current: BarbershopSettings,
  next: BarbershopSettings,
  at: Date,
): Result<{ settings: BarbershopSettings; audit: AuditEntry }> {
  const allowed = requirePermission(ctx, "settings.manage");
  if (!allowed.ok) return allowed;
  const valid = validateSettings(next);
  if (!valid.ok) return valid;
  const changes: Record<string, string> = {};
  for (const key of Object.keys(current) as (keyof BarbershopSettings)[]) {
    if (current[key] !== next[key]) changes[key] = `${current[key]} → ${next[key]}`;
  }
  if (Object.keys(changes).length === 0) return fail("INVALID_INPUT", "Nenhuma alteração para salvar.");
  return ok({
    settings: valid.value,
    audit: { barbershopId: ctx.barbershopId, action: "settings.changed", userId: ctx.userId, at, entityId: ctx.barbershopId, details: changes },
  });
}
