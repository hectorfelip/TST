/** Reading what the browser sent. Everything from a form is untrusted text: it is parsed here, then checked again by the rules. */
import { toCents, type Cents } from "@/shared/money";
import { fail, ok, type Result } from "@/shared/result";

export const text = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

/** "45,50" -> 4550. Empty -> `emptyAs`. Not a money value -> a friendly refusal. */
export function money(data: FormData, name: string, label: string, emptyAs: Cents | null = null): Result<Cents | null> {
  const raw = text(data, name).trim();
  if (raw === "") return ok(emptyAs);
  try {
    return ok(toCents(raw));
  } catch {
    return fail("INVALID_INPUT", `${label}: valor inválido. Use o formato 45,50.`);
  }
}

export function whole(data: FormData, name: string, label: string): Result<number> {
  const raw = text(data, name).trim();
  if (!/^-?\d{1,9}$/.test(raw)) return fail("INVALID_INPUT", `${label}: informe um número inteiro.`);
  return ok(Number(raw));
}
