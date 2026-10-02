import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and refuses the wrong one", async () => {
    const hash = await hashPassword("cadeira-azul-77");
    expect(await verifyPassword("cadeira-azul-77", hash)).toBe(true);
    expect(await verifyPassword("cadeira-azul-78", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("two hashes of the same password differ (random salt), and the text never contains the password", async () => {
    const [a, b] = [await hashPassword("cadeira-azul-77"), await hashPassword("cadeira-azul-77")];
    expect(a).not.toBe(b);
    expect(a).not.toContain("cadeira");
    expect(a).toMatch(/^scrypt\$16384\$8\$5\$[^$]+\$[^$]+$/);
  });

  it("accents are compared in a normalized form (the same word typed on another keyboard still matches)", async () => {
    const hash = await hashPassword("açúcar-doce-1");
    expect(await verifyPassword("ac\u0327u\u0301car-doce-1", hash)).toBe(true);
  });

  it("garbage in the database never crashes and never matches", async () => {
    for (const stored of [null, undefined, "", "plain", "scrypt$1$2", "bcrypt$x$y$z$a$b", "scrypt$0$8$5$AA==$AA==", "scrypt$99999999$8$5$AA==$AA=="]) {
      expect(await verifyPassword("anything-123", stored), String(stored)).toBe(false);
    }
  });

  it("the dummy hash never matches, but costs as much as a real one", async () => {
    expect(await verifyPassword("cadeira-azul-77", DUMMY_HASH)).toBe(false);
    const real = await hashPassword("x-y-z-123456");
    const time = async (stored: string) => {
      const start = performance.now();
      await verifyPassword("whatever-123", stored);
      return performance.now() - start;
    };
    const [dummy, real_] = [await time(DUMMY_HASH), await time(real)];
    expect(dummy).toBeGreaterThan(real_ / 4); // same order of magnitude: not an instant answer
  });
});
