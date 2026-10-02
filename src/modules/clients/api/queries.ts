import "server-only";
import { can } from "@/modules/auth/rules/permissions";
import { loadWorld } from "@/server/lookups";
import { read } from "@/server/run";
import { clockTime, relativeDay } from "@/shared/time";
import type { Cents } from "@/shared/money";
import { clientViewCmd } from "../data/commands";
import { lastVisitByClient, listClients } from "../data/clients.repo";
import { formatPhone, isAway, matchesSearch } from "../rules/clients";

const DAY = 24 * 60 * 60 * 1000;

export type ClientRow = { id: string; name: string; /** null for a barber: the phone never reaches his browser. */ phone: string | null; lastVisitDays: number | null; away: boolean };

/** `search` filters by name or phone digits (a barber can search by phone but never sees it). */
export async function loadClientList(search = ""): Promise<{ canSeePhone: boolean; clients: ClientRow[] }> {
  return read(async (tx, ctx) => {
    const world = await loadWorld(tx);
    const clients = await listClients(tx);
    const visits = await lastVisitByClient(tx);
    const canSeePhone = can(ctx.role, "client.view_phone");
    return {
      canSeePhone,
      clients: clients
        .filter((c) => matchesSearch(c, search))
        .map((c) => {
          const last = visits.get(c.id) ?? null;
          return {
            id: c.id,
            name: c.name,
            phone: canSeePhone && c.phone ? formatPhone(c.phone) : null,
            lastVisitDays: last ? Math.floor((world.now.getTime() - last.getTime()) / DAY) : null,
            away: isAway(last, world.now, world.settings),
          };
        }),
    };
  });
}

export type ClientPage =
  | { kind: "missing" }
  | {
      kind: "ok";
      id: string;
      name: string;
      phone: string | null;
      notes: string | null;
      isOwner: boolean;
      visitCount: number;
      lastVisitDays: number | null;
      noShowCount: number;
      anonymized: boolean;
      visits: { id: string; when: string; description: string; barberName: string; amount: Cents }[];
    };

export async function loadClientPage(id: string): Promise<ClientPage> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { kind: "missing" };
  return read(async (tx, ctx) => {
    const world = await loadWorld(tx);
    const view = await clientViewCmd(tx, ctx, id); // applies decision B: a barber gets no phone and only his own visits
    if (!view.ok) return { kind: "missing" };
    const v = view.value;
    return {
      kind: "ok",
      id: v.id,
      name: v.name,
      phone: v.phone ? formatPhone(v.phone) : null,
      notes: v.notes,
      isOwner: can(ctx.role, "client.anonymize"),
      visitCount: v.visits.length,
      lastVisitDays: v.lastVisitAt ? Math.floor((world.now.getTime() - v.lastVisitAt.getTime()) / DAY) : null,
      noShowCount: v.noShowCount,
      anonymized: v.name === "Cliente removido",
      visits: v.visits.map((visit) => ({
        id: `${visit.comandaId}-${visit.barberId}`,
        when: `${relativeDay(visit.at, world.now, world.timeZone)} ${clockTime(visit.at, world.timeZone)}`,
        description: visit.description,
        barberName: world.employeeName(visit.barberId),
        amount: visit.amount,
      })),
    };
  });
}

/** For the pickers (new comanda, schedule): name for everybody, phone only for the owner. */
export async function loadClientOptions(): Promise<{ id: string; name: string; phone: string }[]> {
  const { clients } = await loadClientList();
  return clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? "" }));
}
