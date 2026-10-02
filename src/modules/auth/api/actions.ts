"use server";
import { redirect } from "next/navigation";
import { withPublic } from "@/db/client";
import { setPasswordCmd } from "@/modules/auth/data/credentials";
import { authenticate } from "@/modules/auth/data/login";
import { endSession, startSession } from "@/server/auth";
import { appPool } from "@/server/db";
import { text } from "@/server/form";
import { act, type ActionResult } from "@/server/run";
import { ok } from "@/shared/result";

/** E-mail + password. ONE vague message for every failure, so nobody can discover which e-mails exist. */
export async function loginAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  try {
    const result = await withPublic(await appPool(), (tx) => authenticate(tx, text(formData, "email"), text(formData, "password")));
    if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message };
    await startSession(result.value.employeeId);
  } catch (error) {
    console.error("[login] unexpected error:", error);
    return { ok: false, code: "UNEXPECTED", message: "Não foi possível entrar agora. Tente de novo em instantes." };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/** Anyone changes their OWN password, typing the current one. The old sessions of this person (other phones) stop working. */
export async function changeOwnPasswordAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ idempotency: { key: text(formData, "key"), action: "password.change" } }, async (tx, ctx) => {
    if (text(formData, "password") !== text(formData, "confirm")) return { ok: false as const, error: { code: "INVALID_INPUT" as const, message: "As duas senhas novas são diferentes." } };
    const done = await setPasswordCmd(tx, ctx, { employeeId: ctx.userId, password: text(formData, "password"), currentPassword: text(formData, "current") });
    return done.ok ? ok(null) : done;
  });
  if (result.ok) {
    // This very session was created before the change, so it ends too: log in again with the new password.
    await endSession();
    redirect("/login?senha=trocada");
  }
  return result;
}
