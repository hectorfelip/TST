import { describe, expect, it } from "vitest";
import { formatBRL, toCents } from "./money";

describe("toCents", () => {
  it("parses Brazilian formats", () => {
    expect(toCents("35,90")).toBe(3590);
    expect(toCents("R$ 1.250,5")).toBe(125050);
    expect(toCents("40")).toBe(4000);
    expect(toCents("-10,00")).toBe(-1000);
  });

  it("does not suffer from float rounding", () => {
    expect(toCents("0,10") + toCents("0,20")).toBe(toCents("0,30"));
  });

  it("rejects invalid input", () => {
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("10,999")).toThrow();
  });
});

describe("formatBRL", () => {
  it("formats cents as reais", () => {
    expect(formatBRL(3590)).toMatch(/R\$\s35,90/);
  });

  it("rejects non-integer cents", () => {
    expect(() => formatBRL(35.9)).toThrow();
  });
});
