import { describe, expect, it } from "vitest";
import { can, requirePermission, type Action } from "./permissions";

const ownerOnly: Action[] = [
  "comanda.edit_any",
  "comanda.view_any",
  "comanda.assign_other_barber",
  "comanda.discount",
  "comanda.cancel_closed",
  "comanda.change_payment_method",
  "cash.open",
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

describe("permissions", () => {
  it("owner can do everything", () => {
    for (const action of [...ownerOnly, "comanda.open", "comanda.edit_own", "client.create"] as Action[]) {
      expect(can("owner", action)).toBe(true);
    }
  });

  it("barber can open/edit own comandas and create clients", () => {
    expect(can("barber", "comanda.open")).toBe(true);
    expect(can("barber", "comanda.edit_own")).toBe(true);
    expect(can("barber", "client.create")).toBe(true);
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
