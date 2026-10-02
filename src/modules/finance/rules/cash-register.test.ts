import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { expectError, NOW, openCash, owner, rafael, intruder } from "@/test/fixtures";
import {
  closeRegister,
  expectedCash,
  movement,
  openRegister,
  recordExpense,
  recordWithdrawal,
  salesByMethod,
  type CashMovement,
} from "./cash-register";

describe("open (R-CSH-01)", () => {
  it("owner opens with opening cash; creates the opening movement", () => {
    const { register, movement: m } = unwrap(openRegister(owner, { id: "r1", openingCash: 10000, at: NOW }, null));
    expect(register).toMatchObject({ status: "open", openedBy: "carlos", openingCash: 10000 });
    expect(m).toMatchObject({ type: "opening", method: "cash", amount: 10000 });
  });

  it("barber cannot open; only one open register; no negative opening cash", () => {
    const { register } = openCash();
    expectError(openRegister(rafael, { id: "r", openingCash: 0, at: NOW }, null), "FORBIDDEN");
    expectError(openRegister(owner, { id: "r", openingCash: 0, at: NOW }, register), "INVALID_STATE");
    expectError(openRegister(owner, { id: "r", openingCash: -1, at: NOW }, null), "INVALID_INPUT");
  });
});

describe("expected cash (R-CSH-02)", () => {
  it("counts only cash; Pix and cards never enter the drawer (step 2 bug)", () => {
    const { register, movements } = openCash(10000);
    const all: CashMovement[] = [
      ...movements,
      movement(register, "rafael", "sale", "cash", 4700, "#1023", "c1", NOW),
      movement(register, "rafael", "sale", "pix", 6000, "#1024", "c2", NOW),
      movement(register, "rafael", "sale", "credit", 10990, "#1021", "c3", NOW),
      movement(register, "carlos", "expense", "cash", -1850, "café", null, NOW),
    ];
    expect(expectedCash(all)).toBe(12850);
    expect(salesByMethod(all)).toEqual({ cash: 4700, pix: 6000, debit: 0, credit: 10990 });
  });
});

describe("expenses and withdrawals (R-CSH-03/04)", () => {
  it("expense is owner-only, positive, described, stored as money out", () => {
    const { register } = openCash();
    expect(unwrap(recordExpense(owner, register, { amount: 1850, method: "cash", description: "café", at: NOW }))).toMatchObject({ amount: -1850, type: "expense" });
    expectError(recordExpense(rafael, register, { amount: 1850, method: "cash", description: "café", at: NOW }), "FORBIDDEN");
    expectError(recordExpense(owner, register, { amount: 0, method: "cash", description: "café", at: NOW }), "INVALID_INPUT");
    expectError(recordExpense(owner, register, { amount: 100, method: "cash", description: " ", at: NOW }), "INVALID_INPUT");
    expectError(recordExpense(owner, null, { amount: 100, method: "cash", description: "café", at: NOW }), "INVALID_STATE");
  });

  it("withdrawal cannot exceed the cash in the drawer, needs a reason, is audited", () => {
    const { register, movements } = openCash(10000);
    expectError(recordWithdrawal(owner, register, movements, { amount: 10001, reason: "Depósito no banco", at: NOW }), "NOT_ALLOWED");
    expectError(recordWithdrawal(owner, register, movements, { amount: 5000, reason: "", at: NOW }), "INVALID_INPUT");
    expectError(recordWithdrawal(rafael, register, movements, { amount: 5000, reason: "Depósito no banco", at: NOW }), "FORBIDDEN");
    const { movement: m, audit } = unwrap(recordWithdrawal(owner, register, movements, { amount: 5000, reason: "Depósito no banco", at: NOW }));
    expect(expectedCash([...movements, m])).toBe(5000);
    expect(audit.action).toBe("cash.withdrawal");
  });
});

describe("close (R-CSH-05)", () => {
  it("matching count closes with no audit", () => {
    const { register, movements } = openCash(12850);
    const { register: closed, audit } = unwrap(closeRegister(owner, register, movements, { countedCash: 12850, reason: null, openComandas: 0, at: NOW }));
    expect(closed).toMatchObject({ status: "closed", difference: 0, differenceReason: null, closedBy: "carlos" });
    expect(audit).toBeNull();
  });

  it("difference needs a reason and is audited (negative = missing money)", () => {
    const { register, movements } = openCash(12850);
    expectError(closeRegister(owner, register, movements, { countedCash: 12000, reason: null, openComandas: 0, at: NOW }), "INVALID_INPUT");
    const { register: closed, audit } = unwrap(closeRegister(owner, register, movements, { countedCash: 12000, reason: "Troco errado", at: NOW, openComandas: 0 }));
    expect(closed.difference).toBe(-850);
    expect(audit).toMatchObject({ action: "cash.closed_with_difference", details: { difference: -850 } });
  });

  it("blocked while comandas are open; barber cannot close; closed register cannot close again", () => {
    const { register, movements } = openCash();
    expectError(closeRegister(owner, register, movements, { countedCash: 10000, reason: null, openComandas: 3, at: NOW }), "NOT_ALLOWED");
    expectError(closeRegister(rafael, register, movements, { countedCash: 10000, reason: null, openComandas: 0, at: NOW }), "FORBIDDEN");
    expectError(closeRegister(intruder, register, movements, { countedCash: 10000, reason: null, openComandas: 0, at: NOW }), "WRONG_TENANT");
    const closed = unwrap(closeRegister(owner, register, movements, { countedCash: 10000, reason: null, openComandas: 0, at: NOW })).register;
    expectError(closeRegister(owner, closed, movements, { countedCash: 10000, reason: null, openComandas: 0, at: NOW }), "INVALID_STATE");
  });
});
