import { randomUUID } from "node:crypto";
import type { Tx } from "@/db/client";
import { fail, type Result } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { createService, setServiceActive, updateService, type Service, type ServiceInput } from "../rules/catalog";
import { getService, insertService, updateService as saveService } from "./services.repo";

const notFound = () => fail("WRONG_TENANT", "Registro não encontrado.");

export async function createServiceCmd(tx: Tx, ctx: TenantContext, input: ServiceInput): Promise<Result<Service>> {
  const service = createService(ctx, randomUUID(), input);
  if (!service.ok) return service;
  await insertService(tx, service.value);
  return service;
}

/** R-SRV-02: only the catalog changes. Comandas keep the price they were sold at. */
export async function updateServiceCmd(tx: Tx, ctx: TenantContext, serviceId: string, input: ServiceInput): Promise<Result<Service>> {
  const current = await getService(tx, serviceId);
  if (!current) return notFound();
  const service = updateService(ctx, current, input);
  if (!service.ok) return service;
  await saveService(tx, service.value);
  return service;
}

export async function setServiceActiveCmd(tx: Tx, ctx: TenantContext, serviceId: string, active: boolean): Promise<Result<Service>> {
  const current = await getService(tx, serviceId);
  if (!current) return notFound();
  const service = setServiceActive(ctx, current, active);
  if (!service.ok) return service;
  await saveService(tx, service.value);
  return service;
}
