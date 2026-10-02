import { describe, expect, it } from "vitest";
import { can, requirePermission, type Action } from "./permissions";

const ownerOnly: Action[] = [
  "comanda.edit_any",
  "comanda.view_any",
  "comanda.assign_other_barber",
  "comanda.discount",
  "comanda.cancel_open",
  "comanda.cancel_closed",
  "comanda.change_payment_method",
  "cash.close",
  "cash.expense",
  "cash.withdrawal",
  "cash.view",
  "client.edit",
  "client.anonymize",
  "client.view_phone",
  "client.view_full_history",
  "service.manage",
  "inventory.manage",
  "employee.manage",
  "report.view",
  "settings.manage",
];

const barberAllowed: Action[] = ["comanda.open", "comanda.edit_own", "comanda.mark_no_show", "cash.open", "client.create"];

describe("permissions", () => {
  it("owner can do everything", () => {
    for (const action of [...ownerOnly, ...barberAllowed] as Action[]) {
      expect(can("owner", action)).toBe(true);
    }
  });

  it.each(barberAllowed)("barber can %s", (action) => {
    expect(can("barber", action)).toBe(true);
  });

  it("R-CSH-01: a barber can OPEN the register, but only the owner can CLOSE it", () => {
    expect(can("barber", "cash.open")).toBe(true);
    expect(can("barber", "cash.close")).toBe(false);
  });

  it("R-CMD-19: a barber cannot cancel an open comanda (he marks a no-show instead)", () => {
    expect(can("barber", "comanda.cancel_open")).toBe(false);
    expect(can("barber", "comanda.mark_no_show")).toBe(true);
  });

  it.each(ownerOnly)("barber cannot %s", (action) => {
    expect(can("barber", action)).toBe(false);
  });

  it("requirePermission returns FORBIDDEN for barbers", () => {
    const result = requirePermission({ barbershopId: "b1", userId: "u1", role: "barber" }, "comanda.discount");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });
});
