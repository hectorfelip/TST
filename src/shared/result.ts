/**
 * Rules never throw for business problems. They return a Result:
 * either { ok: true, value } or { ok: false, error }.
 * `message` is shown to the user (pt-BR); `code` is for code and tests.
 */
export type DomainError = { code: ErrorCode; message: string };

export type ErrorCode =
  | "FORBIDDEN"
  | "WRONG_TENANT"
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "NOT_ALLOWED";

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

/** Throws on failure. Only for tests and for code that already validated. */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
