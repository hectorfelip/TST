/**
 * Things that change from shop to shop are settings, not fixed code
 * (lesson from step 1: one owner's habits must not become rules for all).
 */
import { fail, ok, type Result } from "@/shared/result";

export type BarbershopSettings = {
  /** A client with no visit for more than this many days is shown as "Sumido". */
  awayAfterDays: number;
};

export const DEFAULT_SETTINGS: BarbershopSettings = { awayAfterDays: 30 };

export function validateSettings(input: BarbershopSettings): Result<BarbershopSettings> {
  if (!Number.isInteger(input.awayAfterDays) || input.awayAfterDays < 7 || input.awayAfterDays > 365) {
    return fail("INVALID_INPUT", "Dias para cliente sumido deve ser entre 7 e 365.");
  }
  return ok(input);
}
