"use server";
import { setPasswordCmd } from "@/modules/auth/data/credentials";
import { act, type ActionResult } from "@/server/run";
import { text } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { fail, ok } from "@/shared/result";
import type { Role } from "@/shared/tenant";
import { changeRoleCmd, createEmployeeCmd, setEmployeeActiveCmd } from "../data/commands";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });
const role = (raw: string): Role | null => (raw === "owner" || raw === "barber" ? raw : null);

/**
 * Adds a person AND gives them a first password, in one go (all or nothing: nobody is left without a way to log in).
 * The owner tells the person the password and they change it on "Minha senha".
 */
export async function createEmployeeAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "employee.manage", idempotency: idem(formData, "employee.create") }, async (tx, ctx) => {
    const chosen = role(text(formData, "role"));
    if (!chosen) return fail("INVALID_INPUT", "Escolha o papel da pessoa.");
    const created = await createEmployeeCmd(tx, ctx, { name: text(formData, "name"), email: text(formData, "email"), role: chosen });
    if (!created.ok) return created;
    const password = await setPasswordCmd(tx, ctx, { employeeId: created.value.id, password: text(formData, "password") });
    return password.ok ? ok(null) : password;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** The owner sets a new password for someone (forgot it). It logs that person out of every device. */
export async function resetPasswordAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "employee.manage", idempotency: idem(formData, "employee.reset_password") }, async (tx, ctx) => {
    const done = await setPasswordCmd(tx, ctx, { employeeId: text(formData, "employeeId"), password: text(formData, "password") });
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}

export async function changeRoleAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "employee.manage", idempotency: idem(formData, "employee.role") }, async (tx, ctx) => {
    const chosen = role(text(formData, "role"));
    if (!chosen) return fail("INVALID_INPUT", "Escolha o papel da pessoa.");
    const done = await changeRoleCmd(tx, ctx, text(formData, "employeeId"), chosen);
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** Nobody is deleted: a person who leaves is deactivated (their old comandas keep their name). */
export async function setActiveAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "employee.manage", idempotency: idem(formData, "employee.active") }, async (tx, ctx) => {
    const done = await setEmployeeActiveCmd(tx, ctx, text(formData, "employeeId"), text(formData, "active") === "yes");
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}
