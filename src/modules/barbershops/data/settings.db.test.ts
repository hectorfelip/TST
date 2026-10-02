import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { createWorld } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { updateSettingsCmd } from "./commands";
import { getSettings } from "./settings.repo";
import { DEFAULT_SETTINGS } from "../rules/settings";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("barbershop settings (R-SET-01/02)", () => {
  it("a new barbershop starts with the defaults", async () => {
    const w = await createWorld(db);
    expect(await db.as(w.owner, (tx) => getSettings(tx))).toEqual(DEFAULT_SETTINGS);
  });

  it("the owner turns the automatic cancellation off / sets a custom deadline; it is saved and audited old → new", async () => {
    const w = await createWorld(db);
    const next = { ...DEFAULT_SETTINGS, autoCancelPending: false, pendingExpiryDays: 12 };
    unwrap(await db.as(w.owner, (tx) => updateSettingsCmd(tx, w.owner, next)));
    expect(await db.as(w.owner, (tx) => getSettings(tx))).toEqual(next);
    const audit = await db.as(w.owner, (tx) => listAudit(tx, { action: "settings.changed" }));
    expect(audit[0].details).toEqual({ autoCancelPending: "true → false", pendingExpiryDays: "5 → 12" });
  });

  it("a barber cannot change settings; invalid values are refused; another barbershop is not affected", async () => {
    const a = await createWorld(db, "Barbearia A");
    const b = await createWorld(db, "Barbearia B");
    expect(await db.as(a.rafael, (tx) => updateSettingsCmd(tx, a.rafael, { ...DEFAULT_SETTINGS, pendingExpiryDays: 9 }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.as(a.owner, (tx) => updateSettingsCmd(tx, a.owner, { ...DEFAULT_SETTINGS, pendingExpiryDays: 45 }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    unwrap(await db.as(a.owner, (tx) => updateSettingsCmd(tx, a.owner, { ...DEFAULT_SETTINGS, pendingExpiryDays: 9 })));
    expect((await db.as(b.owner, (tx) => getSettings(tx))).pendingExpiryDays).toBe(5);
  });
});
