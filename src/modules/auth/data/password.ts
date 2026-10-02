/**
 * Password hashing with scrypt (built into Node.js: no extra library to trust or update).
 * The stored text carries its own parameters, so they can be made stronger later and old
 * passwords still verify:  scrypt$N$r$p$salt$hash
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 5; // N=2^14, r=8, p=5 is one of the combinations recommended by OWASP for scrypt
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: 128 * n * r * 2 };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 2 ** 20 || r > 32 || p > 16) return false;
  try {
    const expected = Buffer.from(parts[5], "base64");
    const actual = await derive(password, Buffer.from(parts[4], "base64"), n, r, p);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** A hash nobody can match: verifying against it costs the same time as a real one (so an unknown e-mail cannot be told apart by speed). */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$AAAAAAAAAAAAAAAAAAAAAA==$${Buffer.alloc(KEY_LENGTH).toString("base64")}`;
