import { describe, expect, it } from "vitest";
import { assertSecret, createSessionToken, readSessionToken, SESSION_MAX_AGE_SECONDS } from "./session-token";

const SECRET = "a".repeat(40);
const NOW = new Date("2026-10-02T12:00:00Z");
const EMPLOYEE = "11111111-1111-4111-8111-111111111111";

describe("session token", () => {
  it("a token we made is read back", () => {
    const token = createSessionToken(EMPLOYEE, SECRET, NOW);
    expect(readSessionToken(token, SECRET, new Date(NOW.getTime() + 1000))).toEqual({
      employeeId: EMPLOYEE,
      issuedAt: NOW.getTime(),
      expiresAt: NOW.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
    });
  });

  it("expires after 7 days", () => {
    const token = createSessionToken(EMPLOYEE, SECRET, NOW);
    expect(readSessionToken(token, SECRET, new Date(NOW.getTime() + 6.9 * 86400_000))).not.toBeNull();
    expect(readSessionToken(token, SECRET, new Date(NOW.getTime() + 7.1 * 86400_000))).toBeNull();
  });

  it("another secret, an edited body or an edited signature is refused", () => {
    const token = createSessionToken(EMPLOYEE, SECRET, NOW);
    const [body, signature] = token.split(".");
    expect(readSessionToken(token, "b".repeat(40), NOW)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ e: "22222222-2222-4222-8222-222222222222", i: NOW.getTime(), x: NOW.getTime() + 1e9 })).toString("base64url");
    expect(readSessionToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(readSessionToken(`${body}.${signature.slice(0, -2)}AA`, SECRET, NOW)).toBeNull();
  });

  it("a token from the future (clock tricks) is refused", () => {
    const token = createSessionToken(EMPLOYEE, SECRET, new Date(NOW.getTime() + 3600_000));
    expect(readSessionToken(token, SECRET, NOW)).toBeNull();
  });

  it.each([undefined, null, "", "abc", "a.b", "a.b.c", ".", "x".repeat(2000)])("garbage never throws and never matches: %j", (value) => {
    expect(readSessionToken(value as string | undefined, SECRET, NOW)).toBeNull();
  });

  it("refuses to work without a strong secret", () => {
    expect(() => assertSecret(undefined)).toThrow(/SESSION_SECRET/);
    expect(() => assertSecret("short")).toThrow(/SESSION_SECRET/);
    expect(() => createSessionToken(EMPLOYEE, "short", NOW)).toThrow(/SESSION_SECRET/);
    expect(assertSecret(SECRET)).toBe(SECRET);
  });
});
