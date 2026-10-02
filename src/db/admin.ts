/**
 * Platform admin operations: they create things that do not belong to any
 * barbershop yet (R-TEN: barbershops are created by hand in the MVP; there is
 * no self sign-up). Use the OWNER connection.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { DEFAULT_SETTINGS, validateSettings } from "@/modules/barbershops/rules/settings";
import { withAdmin } from "./client";

export type NewBarbershop = { name: string; ownerName: string; ownerEmail: string; timeZone?: string };

export async function createBarbershopWithOwner(
  adminPool: Pool,
  input: NewBarbershop,
): Promise<{ barbershopId: string; ownerId: string }> {
  const settings = validateSettings({ ...DEFAULT_SETTINGS, timeZone: input.timeZone ?? DEFAULT_SETTINGS.timeZone });
  if (!settings.ok) throw new Error(settings.error.message);
  const barbershopId = randomUUID();
  const ownerId = randomUUID();
  return withAdmin(adminPool, async (tx) => {
    await tx.query(
      `INSERT INTO barbershops (id, name, away_after_days, auto_cancel_pending, pending_expiry_days, time_zone)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        barbershopId,
        input.name.trim(),
        settings.value.awayAfterDays,
        settings.value.autoCancelPending,
        settings.value.pendingExpiryDays,
        settings.value.timeZone,
      ],
    );
    // A barbershop is born with its owner (R-EMP-02: it always has at least one).
    await tx.query(`INSERT INTO employees (id, barbershop_id, name, email, role) VALUES ($1, $2, $3, $4, 'owner')`, [
      ownerId,
      barbershopId,
      input.ownerName.trim(),
      input.ownerEmail.trim().toLowerCase(),
    ]);
    return { barbershopId, ownerId };
  });
}
