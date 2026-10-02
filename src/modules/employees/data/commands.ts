import { randomUUID } from "node:crypto";
import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { guarded } from "@/db/errors";
import { lockBarbershop } from "@/modules/barbershops/data/settings.repo";
import { fail, ok, type Result } from "@/shared/result";
import type { Role, TenantContext } from "@/shared/tenant";
import { changeRole, createEmployee, setEmployeeActive, type Employee } from "../rules/employees";
import { emailTaken, getEmployee, insertEmployee, listEmployees, updateEmployee } from "./employees.repo";

const notFound = () => fail("WRONG_TENANT", "Registro não encontrado.");

export function createEmployeeCmd(tx: Tx, ctx: TenantContext, input: { name: string; email: string; role: Role }): Promise<Result<Employee>> {
  return guarded(async () => {
    const created = createEmployee(ctx, { id: randomUUID(), ...input }, await emailTaken(tx, input.email));
    if (!created.ok) return created;
    await insertEmployee(tx, created.value);
    return created;
  });
}

/**
 * R-EMP-02: "at least one active owner" reads the whole team and then writes.
 * The barbershop is locked, so two owners cannot demote each other at the same time and leave nobody in charge.
 */
export function changeRoleCmd(tx: Tx, ctx: TenantContext, employeeId: string, role: Role, at = new Date()): Promise<Result<Employee>> {
  return guarded(async () => {
    await lockBarbershop(tx);
    const employee = await getEmployee(tx, employeeId);
    if (!employee) return notFound();
    const result = changeRole(ctx, employee, role, await listEmployees(tx), at);
    if (!result.ok) return result;
    await updateEmployee(tx, result.value.employee);
    await insertAudit(tx, [result.value.audit]);
    return ok(result.value.employee);
  });
}

export function setEmployeeActiveCmd(tx: Tx, ctx: TenantContext, employeeId: string, active: boolean, at = new Date()): Promise<Result<Employee>> {
  return guarded(async () => {
    await lockBarbershop(tx);
    const employee = await getEmployee(tx, employeeId);
    if (!employee) return notFound();
    const result = setEmployeeActive(ctx, employee, active, await listEmployees(tx), at);
    if (!result.ok) return result;
    await updateEmployee(tx, result.value.employee);
    if (result.value.audit) await insertAudit(tx, [result.value.audit]);
    return ok(result.value.employee);
  });
}
