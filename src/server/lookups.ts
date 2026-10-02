import "server-only";
import type { Tx } from "@/db/client";
import { getSettings } from "@/modules/barbershops/data/settings.repo";
import { pendingExpiry, type BarbershopSettings } from "@/modules/barbershops/rules/settings";
import { listClients } from "@/modules/clients/data/clients.repo";
import { listEmployees } from "@/modules/employees/data/employees.repo";
import { clientDisplayName, WALK_IN_LABEL, type Lookups } from "@/modules/service-orders/api/views";
import type { Employee } from "@/modules/employees/rules/employees";

export type World = Lookups & { settings: BarbershopSettings; employees: Employee[] };

/** Names, time zone and settings for one request. Phones and notes are NOT loaded here: only what a comanda screen needs. */
export async function loadWorld(tx: Tx, now: Date = new Date()): Promise<World> {
  const settings = await getSettings(tx);
  const employees = await listEmployees(tx);
  const clients = await listClients(tx);
  const employeeById = new Map(employees.map((e) => [e.id, e.name]));
  const clientById = new Map(clients.map((c) => [c.id, clientDisplayName(c)]));
  return {
    now,
    timeZone: settings.timeZone,
    expiryDays: pendingExpiry(settings),
    settings,
    employees,
    employeeName: (id) => employeeById.get(id) ?? "—",
    clientName: (id) => (id === null ? WALK_IN_LABEL : (clientById.get(id) ?? clientDisplayName(undefined))),
  };
}
