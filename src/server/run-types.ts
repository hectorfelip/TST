import type { ErrorCode } from "@/shared/result";

/** What an action tells the browser: serializable, no stack traces, no database words. */
export type ActionResult<T = null> =
  | { ok: true; value: T; replayed?: boolean }
  | { ok: false; code: ErrorCode | "UNAUTHENTICATED" | "UNEXPECTED"; message: string };
