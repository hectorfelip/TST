import { insertAudit } from "@/db/audit";
import type { Tx } from "@/db/client";
import type { Result } from "@/shared/result";
import { ok } from "@/shared/result";
import type { TenantContext } from "@/shared/tenant";
import { updateSettings, type BarbershopSettings } from "../rules/settings";
import { getSettings, saveSettings } from "./settings.repo";

/** R-SET-02: owner only; saved together with the audit entry (old → new). */
export async function updateSettingsCmd(tx: Tx, ctx: TenantContext, next: BarbershopSettings, at = new Date()): Promise<Result<BarbershopSettings>> {
  const result = updateSettings(ctx, await getSettings(tx), next, at);
  if (!result.ok) return result;
  await saveSettings(tx, result.value.settings);
  await insertAudit(tx, [result.value.audit]);
  return ok(result.value.settings);
}
