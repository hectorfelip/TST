/**
 * The database is the LAST line of defence. If two people do the same thing at
 * the same instant, the rules (which read before they write) can both say
 * "ok", and PostgreSQL refuses the second one. This turns that refusal into
 * the same kind of answer the rules give, instead of a crash.
 */
import { fail, type Result } from "@/shared/result";

const KNOWN: Record<string, { code: "INVALID_STATE" | "NOT_ALLOWED"; message: string }> = {
  one_open_register_per_shop: { code: "INVALID_STATE", message: "Já existe um caixa aberto. Feche-o antes de abrir outro." },
  clients_phone_key: { code: "NOT_ALLOWED", message: "Já existe um cliente com este telefone." },
  employees_email_key: { code: "NOT_ALLOWED", message: "Este e-mail já está em uso." },
};

export function translateDbError(error: unknown): Result<never> | null {
  const e = error as { code?: string; constraint?: string };
  if (e?.code === "23505" && e.constraint && KNOWN[e.constraint]) return fail(KNOWN[e.constraint].code, KNOWN[e.constraint].message);
  if (e?.code === "23514" && /at least one active owner/.test((error as Error).message)) {
    return fail("NOT_ALLOWED", "A barbearia precisa ter pelo menos um dono ativo.");
  }
  return null;
}

/** Runs the writes; a known constraint violation becomes a rule-style answer, anything else is rethrown. */
export async function guarded<T>(write: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await write();
  } catch (error) {
    const translated = translateDbError(error);
    if (translated) return translated;
    throw error;
  }
}
