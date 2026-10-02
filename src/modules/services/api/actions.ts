"use server";
import { act, type ActionResult } from "@/server/run";
import { money, text, whole } from "@/server/form";
import { refreshScreens } from "@/server/refresh";
import { fail, ok, type Result } from "@/shared/result";
import { createServiceCmd, setServiceActiveCmd, updateServiceCmd } from "../data/commands";
import type { ServiceInput } from "../rules/catalog";

const idem = (formData: FormData, action: string) => ({ key: text(formData, "key"), action });

function readInput(formData: FormData): Result<ServiceInput> {
  const price = money(formData, "price", "Preço");
  if (!price.ok) return price;
  const minutes = whole(formData, "minutes", "Duração (minutos)");
  if (!minutes.ok) return minutes;
  if (price.value === null) return fail("INVALID_INPUT", "Informe o preço.");
  return ok({ name: text(formData, "name"), price: price.value, durationMinutes: minutes.value, favorite: text(formData, "favorite") === "yes" });
}

export async function createServiceAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "service.manage", idempotency: idem(formData, "service.create") }, async (tx, ctx) => {
    const input = readInput(formData);
    if (!input.ok) return input;
    const created = await createServiceCmd(tx, ctx, input.value);
    return created.ok ? ok(null) : created;
  });
  if (result.ok) refreshScreens();
  return result;
}

/** A new price never changes old comandas: they keep the price they had (a snapshot). */
export async function updateServiceAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "service.manage", idempotency: idem(formData, "service.update") }, async (tx, ctx) => {
    const input = readInput(formData);
    if (!input.ok) return input;
    const updated = await updateServiceCmd(tx, ctx, text(formData, "serviceId"), input.value);
    return updated.ok ? ok(null) : updated;
  });
  if (result.ok) refreshScreens();
  return result;
}

export async function setServiceActiveAction(_previous: unknown, formData: FormData): Promise<ActionResult> {
  const result = await act({ permission: "service.manage", idempotency: idem(formData, "service.active") }, async (tx, ctx) => {
    const done = await setServiceActiveCmd(tx, ctx, text(formData, "serviceId"), text(formData, "active") === "yes");
    return done.ok ? ok(null) : done;
  });
  if (result.ok) refreshScreens();
  return result;
}
