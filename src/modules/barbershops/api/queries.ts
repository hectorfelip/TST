import "server-only";
import { listComandas } from "@/modules/service-orders/data/comandas.repo";
import { loadWorld } from "@/server/lookups";
import { read } from "@/server/run";
import { DAY_MS } from "@/shared/time";

export type SettingsPage = {
  autoCancelPending: boolean;
  pendingExpiryDays: number;
  awayAfterDays: number;
  /** For the warning "these would be cancelled right away". */
  pending: { number: number; client: string; daysAgo: number }[];
};

export async function loadSettingsPage(): Promise<SettingsPage> {
  return read(async (tx) => {
    const world = await loadWorld(tx);
    const pending = (await listComandas(tx, { statuses: ["open"], limit: 500 })).filter((c) => c.pendingSince);
    return {
      autoCancelPending: world.settings.autoCancelPending,
      pendingExpiryDays: world.settings.pendingExpiryDays,
      awayAfterDays: world.settings.awayAfterDays,
      pending: pending.map((c) => ({
        number: c.number,
        client: world.clientName(c.clientId),
        daysAgo: Math.floor((world.now.getTime() - (c.pendingSince as Date).getTime()) / DAY_MS),
      })),
    };
  });
}
