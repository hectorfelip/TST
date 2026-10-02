import { randomUUID } from "node:crypto";
import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import { guarded } from "@/db/errors";
import { fail, ok, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { anonymizeClient, clientViewFor, createClient, normalizePhone, updateClient, type Client, type ClientInput, type ClientView } from "../rules/clients";
import { findByPhone, getClient, insertClient, noShowCountOf, updateClient as saveClient, visitsOf } from "./clients.repo";

const notFound = () => fail("WRONG_TENANT", "Registro não encontrado.");

/** The phone is normalised first, because the "is it already used?" lookup needs the digits. */
async function phoneOwner(tx: Tx, rawPhone: string): Promise<Client | null> {
  const phone = normalizePhone(rawPhone);
  return phone.ok ? findByPhone(tx, phone.value) : null;
}

export function createClientCmd(tx: Tx, ctx: TenantContext, input: ClientInput & { at?: Date }): Promise<Result<Client>> {
  return guarded(async () => {
    const created = createClient(ctx, { ...input, id: randomUUID(), at: input.at ?? new Date() }, await phoneOwner(tx, input.phone));
    if (!created.ok) return created;
    await insertClient(tx, created.value);
    return created;
  });
}

export async function updateClientCmd(tx: Tx, ctx: TenantContext, clientId: string, input: ClientInput): Promise<Result<Client>> {
  const client = await getClient(tx, clientId);
  if (!client) return notFound();
  return guarded(async () => {
    const updated = updateClient(ctx, client, input, await phoneOwner(tx, input.phone));
    if (!updated.ok) return updated;
    await saveClient(tx, updated.value);
    return updated;
  });
}

/** R-CLI-04 (LGPD): erases the personal data and writes the audit entry together. */
export async function anonymizeClientCmd(tx: Tx, ctx: TenantContext, clientId: string, at = new Date()): Promise<Result<Client>> {
  const client = await getClient(tx, clientId);
  if (!client) return notFound();
  const result = anonymizeClient(ctx, client, at);
  if (!result.ok) return result;
  await saveClient(tx, result.value.client);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.client);
}

/** R-CLI-05 (decision B): what THIS user may see about the client. The phone never leaves the database for a barber. */
export async function clientViewCmd(tx: Tx, ctx: TenantContext, clientId: string): Promise<Result<ClientView>> {
  const client = await getClient(tx, clientId);
  if (!client) return notFound();
  return clientViewFor(ctx, client, await visitsOf(tx, clientId), await noShowCountOf(tx, clientId));
}
