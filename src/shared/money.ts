/**
 * Money is always stored as an integer number of cents (R$ 35,90 -> 3590).
 * Never use floats for money: 0.1 + 0.2 !== 0.3.
 */
export type Cents = number;

export function toCents(reais: string): Cents {
  const normalized = reais.trim().replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid money value: "${reais}"`);
  }
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return normalized.startsWith("-") ? -cents : cents;
}

export function formatBRL(cents: Cents): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Cents must be an integer, got ${cents}`);
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
