import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { expectError, NOW, owner, rafael, SHOP } from "@/test/fixtures";
import { changeRole, createEmployee, setEmployeeActive, type Employee } from "./employees";

const carlos: Employee = { id: "carlos", barbershopId: SHOP, name: "Carlos", email: "carlos@x.com", role: "owner", active: true };
const rafa: Employee = { id: "rafael", barbershopId: SHOP, name: "Rafael", email: "rafael@x.com", role: "barber", active: true };
const team = [carlos, rafa];

describe("employees", () => {
  it("R-EMP-01: owner adds people with a unique, valid e-mail", () => {
    expect(unwrap(createEmployee(owner, { id: "d", name: "Diego", email: " Diego@X.com ", role: "barber" }, false)).email).toBe("diego@x.com");
    expectError(createEmployee(rafael, { id: "d", name: "Diego", email: "d@x.com", role: "barber" }, false), "FORBIDDEN");
    expectError(createEmployee(owner, { id: "d", name: "Diego", email: "not-an-email", role: "barber" }, false), "INVALID_INPUT");
    expectError(createEmployee(owner, { id: "d", name: "Diego", email: "d@x.com", role: "barber" }, true), "NOT_ALLOWED");
  });

  it("R-EMP-02: the last active owner cannot be demoted or deactivated", () => {
    expectError(changeRole(owner, carlos, "barber", team, NOW), "NOT_ALLOWED");
    expectError(setEmployeeActive(owner, carlos, false, team, NOW), "NOT_ALLOWED");
    const withSecondOwner = [...team, { ...rafa, id: "ana", role: "owner" as const }];
    expect(unwrap(changeRole(owner, carlos, "barber", withSecondOwner, NOW)).audit.action).toBe("employee.role_changed");
  });

  it("R-EMP-03: deactivate (audited) and reactivate a barber", () => {
    const { employee, audit } = unwrap(setEmployeeActive(owner, rafa, false, team, NOW));
    expect(employee.active).toBe(false);
    expect(audit?.action).toBe("employee.deactivated");
    expect(unwrap(setEmployeeActive(owner, employee, true, team, NOW)).audit).toBeNull();
    expectError(setEmployeeActive(owner, rafa, true, team, NOW), "INVALID_INPUT");
    expectError(setEmployeeActive(rafael, rafa, false, team, NOW), "FORBIDDEN");
  });
});
