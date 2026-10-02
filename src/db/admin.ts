/**
 * Platform admin operations: they create things that do not belong to any
 * barbershop yet (R-TEN: barbershops are created by hand in the MVP; there is
 * no self sign-up). Use the OWNER connection.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { hashPassword } from "@/modules/auth/data/password";
import { validatePassword } from "@/modules/auth/rules/password";
import { DEFAULT_SETTINGS, validateSettings } from "@/modules/barbershops/rules/settings";
import { withAdmin, type Tx } from "./client";

export type NewBarbershop = { name: string; ownerName: string; ownerEmail: string; ownerPassword?: string; timeZone?: string };

/**
 * The FIRST password of a person (nobody can type a "current" password that does not exist yet),
 * or a rescue when the owner forgot his own. Everyday changes go through setPasswordCmd.
 */
async function writePassword(tx: Tx, employeeId: string, password: string, at: Date): Promise<void> {
  const valid = validatePassword(password);
  if (!valid.ok) throw new Error(valid.error.message);
  await tx.query(
    `INSERT INTO employee_credentials (employee_id, barbershop_id, password_hash, password_changed_at)
     SELECT id, barbershop_id, $2, $3 FROM employees WHERE id = $1
     ON CONFLICT (employee_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, password_changed_at = EXCLUDED.password_changed_at, failed_attempts = 0, locked_until = NULL`,
    [employeeId, await hashPassword(password), at],
  );
}

export function setPasswordAsAdmin(adminPool: Pool, employeeId: string, password: string, at: Date = new Date()): Promise<void> {
  return withAdmin(adminPool, (tx) => writePassword(tx, employeeId, password, at));
}

export async function createBarbershopWithOwner(
  adminPool: Pool,
  input: NewBarbershop,
): Promise<{ barbershopId: string; ownerId: string }> {
  const settings = validateSettings({ ...DEFAULT_SETTINGS, timeZone: input.timeZone ?? DEFAULT_SETTINGS.timeZone });
  if (!settings.ok) throw new Error(settings.error.message);
  if (input.ownerPassword !== undefined) {
    const valid = validatePassword(input.ownerPassword);
    if (!valid.ok) throw new Error(valid.error.message);
  }
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
    if (input.ownerPassword !== undefined) await writePassword(tx, ownerId, input.ownerPassword, new Date());
    return { barbershopId, ownerId };
  });
}
