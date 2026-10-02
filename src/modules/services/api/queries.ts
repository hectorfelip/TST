import "server-only";
import type { Cents } from "@/shared/money";
import { read } from "@/server/run";
import { listServices } from "../data/services.repo";

export type ServiceRow = { id: string; name: string; price: Cents; minutes: number; favorite: boolean; active: boolean };

export async function loadServices(): Promise<ServiceRow[]> {
  return read(async (tx) => (await listServices(tx)).map((s) => ({ id: s.id, name: s.name, price: s.price, minutes: s.durationMinutes, favorite: s.favorite, active: s.active })));
}
