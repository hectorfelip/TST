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
  suggestedOpeningCash,
  type CashMovement,
  type CashRegister,
} from "./cash-register";

const open = (ctx: typeof owner, openingCash: number, previous: CashRegister | null, reason: string | null = null, current: CashRegister | null = null) =>
  openRegister(ctx, { id: "r1", openingCash, reason, at: NOW }, current, previous);

/** Yesterday's register, closed, with R$ 100,00 left in the drawer. */
function yesterday(leftInDrawer = 10000): CashRegister {
  const { register, movements } = openCash(10000);
  return unwrap(closeRegister(owner, register, movements, { countedCash: 10000, leftInDrawer, reason: null, pending: { count: 0, total: 0 }, at: NOW })).register;
}

describe("open (R-CSH-01, revised: a barber can open)", () => {
  it("owner opens with opening cash; creates the opening movement", () => {
    const { register, movement: m, audit } = unwrap(open(owner, 10000, null));
    expect(register).toMatchObject({ status: "open", openedBy: "carlos", openingCash: 10000, openingReason: null });
    expect(m).toMatchObject({ type: "opening", method: "cash", amount: 10000 });
    expect(audit).toBeNull();
  });

  it("a BARBER can open it, and it records who opened", () => {
    expect(unwrap(open(rafael, 10000, null)).register.openedBy).toBe("rafael");
  });

  it("only one open register; no negative opening cash; barber of another shop cannot use it", () => {
    const { register } = openCash();
    expectError(open(owner, 0, null, null, register), "INVALID_STATE");
    expectError(open(owner, -1, null), "INVALID_INPUT");
    expectError(open(intruder, 10000, yesterday()), "WRONG_TENANT");
  });
});

describe("opening cash must match what was left (R-CSH-07)", () => {
  it("suggested opening = cash left in the drawer at the last closing", () => {
    expect(suggestedOpeningCash(yesterday(7000))).toBe(7000);
    expect(suggestedOpeningCash(null)).toBeNull();
  });

  it("same amount: opens normally, no audit", () => {
    expect(unwrap(open(rafael, 10000, yesterday())).audit).toBeNull();
  });

  it("different amount WITHOUT a reason is refused (a barber cannot just declare less cash)", () => {
    expectError(open(rafael, 2000, yesterday()), "INVALID_INPUT");
    expectError(open(rafael, 2000, yesterday(), "?"), "INVALID_INPUT");
  });

  it("different amount WITH a reason opens, and the owner is told (audit)", () => {
    const { register, audit } = unwrap(open(rafael, 2000, yesterday(), "Dono levou R$ 80 para o banco"));
    expect(register.openingReason).toBe("Dono levou R$ 80 para o banco");
    expect(audit).toMatchObject({ action: "cash.opened_with_difference", userId: "rafael", details: { expected: 10000, opening: 2000, difference: -8000 } });
  });

  it("the first register ever has nothing to compare with", () => {
    expect(unwrap(open(rafael, 5000, null)).audit).toBeNull();
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

const NONE = { count: 0, total: 0 };

describe("close (R-CSH-05)", () => {
  it("matching count closes with no audit", () => {
    const { register, movements } = openCash(12850);
    const { register: closed, audits } = unwrap(closeRegister(owner, register, movements, { countedCash: 12850, reason: null, pending: NONE, at: NOW }));
    expect(closed).toMatchObject({ status: "closed", difference: 0, differenceReason: null, closedBy: "carlos", leftInDrawer: 12850 });
    expect(audits).toEqual([]);
  });

  it("difference needs a reason and is audited (negative = missing money)", () => {
    const { register, movements } = openCash(12850);
    expectError(closeRegister(owner, register, movements, { countedCash: 12000, reason: null, pending: NONE, at: NOW }), "INVALID_INPUT");
    const { register: closed, audits } = unwrap(closeRegister(owner, register, movements, { countedCash: 12000, reason: "Troco errado", at: NOW, pending: NONE }));
    expect(closed.difference).toBe(-850);
    expect(audits).toEqual([expect.objectContaining({ action: "cash.closed_with_difference", details: { difference: -850, reason: "Troco errado" } })]);
  });

  it("NOT blocked by pending comandas, but they are recorded in the audit log", () => {
    const { register, movements } = openCash();
    const { register: closed, audits } = unwrap(
      closeRegister(owner, register, movements, { countedCash: 10000, reason: null, pending: { count: 2, total: 9000 }, at: NOW }),
    );
    expect(closed.status).toBe("closed");
    expect(audits).toEqual([expect.objectContaining({ action: "cash.closed_with_pending", details: { count: 2, total: 9000 } })]);
  });

  it("the owner can take cash home: only `leftInDrawer` stays for tomorrow, never more than was counted", () => {
    const { register, movements } = openCash(10000);
    const closed = unwrap(closeRegister(owner, register, movements, { countedCash: 10000, leftInDrawer: 4000, reason: null, pending: NONE, at: NOW })).register;
    expect(closed.leftInDrawer).toBe(4000);
    expectError(closeRegister(owner, register, movements, { countedCash: 10000, leftInDrawer: 10001, reason: null, pending: NONE, at: NOW }), "INVALID_INPUT");
    expectError(closeRegister(owner, register, movements, { countedCash: 10000, leftInDrawer: -1, reason: null, pending: NONE, at: NOW }), "INVALID_INPUT");
  });

  it("R-CSH-01: only the owner CLOSES, even though a barber can open", () => {
    const { register, movements } = openCash();
    const byBarberOpened = unwrap(open(rafael, 10000, null)).register;
    expectError(closeRegister(rafael, byBarberOpened, movements, { countedCash: 10000, reason: null, pending: NONE, at: NOW }), "FORBIDDEN");
    expect(closeRegister(owner, register, movements, { countedCash: 10000, reason: null, pending: NONE, at: NOW }).ok).toBe(true);
  });

  it("barber cannot close; other shop cannot close; closed register cannot close again", () => {
    const { register, movements } = openCash();
    expectError(closeRegister(rafael, register, movements, { countedCash: 10000, reason: null, pending: NONE, at: NOW }), "FORBIDDEN");
    expectError(closeRegister(intruder, register, movements, { countedCash: 10000, reason: null, pending: NONE, at: NOW }), "WRONG_TENANT");
    const closed = unwrap(closeRegister(owner, register, movements, { countedCash: 10000, reason: null, pending: NONE, at: NOW })).register;
    expectError(closeRegister(owner, closed, movements, { countedCash: 10000, reason: null, pending: NONE, at: NOW }), "INVALID_STATE");
  });
});
