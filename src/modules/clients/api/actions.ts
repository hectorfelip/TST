"use server";
import { redirect } from "next/navigation";
import { act, type ActionResult } from "@/server/run";
import { text } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { ok } from "@/shared/result";
import { anonymizeClientCmd, createClientCmd, updateClientCmd } from "../data/commands";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });
const input = (formData: FormData) => ({ name: text(formData, "name"), phone: text(formData, "phone"), notes: text(formData, "notes") });

export async function createClientAction(_previous: unknown, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const result = await act({ permission: "client.create", idempotency: idem(formData, "client.create") }, async (tx, ctx) => {
    const created = await createClientCmd(tx, ctx, input(formData));
    return created.ok ? ok({ id: created.value.id }) : created;
  });
  if (result.ok) {
    refreshScreens();
    redirect(`/clientes/${result.value.id}`);
  }
  return result;
}

export async function updateClientAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "client.edit", idempotency: idem(formData, "client.update") }, async (tx, ctx) => {
    const updated = await updateClientCmd(tx, ctx, text(formData, "clientId"), input(formData));
    return updated.ok ? ok(null) : updated;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** LGPD: erases name, phone and notes. The money history stays, without a name. */
export async function anonymizeClientAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "client.anonymize", idempotency: idem(formData, "client.anonymize") }, async (tx, ctx) => {
    const done = await anonymizeClientCmd(tx, ctx, text(formData, "clientId"));
    return done.ok ? ok(null) : done;
  });
  if (result.ok) {
    refreshScreens();
    redirect("/clientes");
  }
  return result;
}
