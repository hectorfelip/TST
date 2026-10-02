/**
 * Things that change from shop to shop are settings, not fixed code
 * (lesson from step 1: one owner's habits must not become rules for all).
 */
import { fail, ok, type Result } from "@/shared/result";
import { isValidTimeZone } from "@/shared/time";

export type BarbershopSettings = {
  /** A client with no visit for more than this many days is shown as "Sumido". */
  awayAfterDays: number;
  /** A pending (unpaid) comanda is cancelled automatically after this many days. */
  pendingExpiryDays: number;
  /** IANA time zone of the shop. Decides what "today" and "tomorrow" mean. */
  timeZone: string;
};

export const DEFAULT_SETTINGS: BarbershopSettings = {
  awayAfterDays: 30,
  pendingExpiryDays: 5,
  timeZone: "America/Sao_Paulo",
};

export function validateSettings(input: BarbershopSettings): Result<BarbershopSettings> {
  if (!Number.isInteger(input.awayAfterDays) || input.awayAfterDays < 7 || input.awayAfterDays > 365) {
    return fail("INVALID_INPUT", "Dias para cliente sumido deve ser entre 7 e 365.");
  }
  if (!Number.isInteger(input.pendingExpiryDays) || input.pendingExpiryDays < 1 || input.pendingExpiryDays > 30) {
    return fail("INVALID_INPUT", "Prazo das comandas pendentes deve ser entre 1 e 30 dias.");
  }
  if (!isValidTimeZone(input.timeZone)) return fail("INVALID_INPUT", "Fuso horário inválido.");
  return ok(input);
}
