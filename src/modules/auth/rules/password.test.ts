import { describe, expect, it } from "vitest";
import type { TenantContext } from "@/shared/tenant";
import { checkPasswordChange, validatePassword } from "./password";

const owner: TenantContext = { barbershopId: "s1", userId: "o1", role: "owner" };
const barber: TenantContext = { barbershopId: "s1", userId: "b1", role: "barber" };

describe("validatePassword", () => {
  it("accepts a normal password", () => {
    expect(validatePassword("cadeira-azul-77")).toEqual({ ok: true, value: "cadeira-azul-77" });
    expect(validatePassword("minha frase de senha").ok).toBe(true);
  });

  it.each(["", "curta", "1234567"])("refuses too short: %j", (p) => {
    expect(validatePassword(p)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("refuses too long (a huge password is a way to make the server work for nothing)", () => {
    expect(validatePassword("x1".repeat(65)).ok).toBe(false);
    expect(validatePassword("abc".repeat(42) + "ab").ok).toBe(true); // exactly 128
  });

  it.each(["12345678", "PASSWORD", "Senha123", "barbearia123"])("refuses the most common passwords: %s", (p) => {
    expect(validatePassword(p).ok).toBe(false);
  });

  it("refuses passwords with almost no variety", () => {
    expect(validatePassword("aaaaaaaaaa").ok).toBe(false);
    expect(validatePassword("abababababab").ok).toBe(false);
  });
});

describe("checkPasswordChange", () => {
  it("everybody can change their own", () => {
    expect(checkPasswordChange(barber, "b1")).toEqual({ ok: true, value: { self: true } });
    expect(checkPasswordChange(owner, "o1")).toEqual({ ok: true, value: { self: true } });
  });

  it("only the owner changes someone else's", () => {
    expect(checkPasswordChange(owner, "b1")).toEqual({ ok: true, value: { self: false } });
    expect(checkPasswordChange(barber, "o1")).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
