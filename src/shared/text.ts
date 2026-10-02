/** A reason must say something: at least 5 visible characters. */
export const MIN_REASON_LENGTH = 5;

export function isValidReason(reason: string | undefined | null): boolean {
  return (reason ?? "").trim().length >= MIN_REASON_LENGTH;
}

export function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}
