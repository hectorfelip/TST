import "server-only";
import type { Role } from "@/shared/tenant";
import { read } from "@/server/run";
import { listEmployees } from "../data/employees.repo";

export type TeamMember = { id: string; name: string; email: string; role: Role; active: boolean; isMe: boolean };

export async function loadTeam(): Promise<TeamMember[]> {
  return read(async (tx, ctx) =>
    (await listEmployees(tx)).map((e) => ({ id: e.id, name: e.name, email: e.email, role: e.role, active: e.active, isMe: e.id === ctx.userId })),
  );
}
