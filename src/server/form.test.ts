import { describe, expect, it } from "vitest";
import { money, text, whole } from "./form";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

describe("reading a form", () => {
  it("text: missing or a file upload becomes an empty string", () => {
    expect(text(form({ a: "x" }), "a")).toBe("x");
    expect(text(form({}), "a")).toBe("");
    const withFile = new FormData();
    withFile.set("a", new Blob(["x"]), "x.txt");
    expect(text(withFile, "a")).toBe("");
  });

  it("money: Brazilian format to cents; empty uses the default; nonsense is refused with a friendly message", () => {
    expect(money(form({ m: "45,50" }), "m", "Valor")).toEqual({ ok: true, value: 4550 });
    expect(money(form({ m: " R$ 1.234,56 " }), "m", "Valor")).toEqual({ ok: true, value: 123456 });
    expect(money(form({ m: "" }), "m", "Valor", 0)).toEqual({ ok: true, value: 0 });
    expect(money(form({}), "m", "Valor")).toEqual({ ok: true, value: null });
    for (const bad of ["abc", "12,345", "1e3", "--5", "R$"]) {
      expect(money(form({ m: bad }), "m", "Valor")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", message: expect.stringContaining("Valor") } });
    }
  });

  it("whole numbers", () => {
    expect(whole(form({ n: "12" }), "n", "Quantidade")).toEqual({ ok: true, value: 12 });
    expect(whole(form({ n: "-3" }), "n", "Quantidade")).toEqual({ ok: true, value: -3 });
    for (const bad of ["", "1.5", "abc", "12345678901"]) expect(whole(form({ n: bad }), "n", "Quantidade").ok, bad).toBe(false);
  });
});
