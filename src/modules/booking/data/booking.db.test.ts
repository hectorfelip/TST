/**
 * Online booking against a REAL PostgreSQL: the public page's commands, approval, limits, races and isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPublic, withTenant } from "@/db/client";
import { listAudit } from "@/db/audit";
import { listAppointments, getComanda, listComandas, listWaitingApproval } from "@/modules/service-orders/data/comandas.repo";
import { createTestDb, expectPgError, PG, withSlowWrites, type TestDb } from "@/test/db/helpers";
import { createWorld, type World } from "@/test/db/world";
import { unwrap } from "@/shared/result";
import { DAY_MS, dayRange } from "@/shared/time";
import { DEFAULT_BOOKING_SETTINGS, type BookingSettings } from "../rules/settings";
import { approveBookingCmd, createOnlineBookingCmd, declineBookingCmd, saveBookingSettingsCmd, setTakesOnlineCmd, type PublicBookingInput } from "./commands";
import { listBookableBarbers } from "./booking.repo";
import { getBookingSettings, lookupShopBySlug } from "./settings.repo";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const NIL = "00000000-0000-4000-8000-000000000000";
const NOW = new Date(); // the booking window is relative to the real clock
const nextMonday = () => {
  const d = new Date(NOW.getTime() + 2 * DAY_MS);
  while (new Date(d.getTime() - 3 * 3600_000).getUTCDay() !== 1) d.setTime(d.getTime() + DAY_MS);
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10); // local date in São Paulo
};
const MONDAY = nextMonday();
const settingsOn: BookingSettings = { ...DEFAULT_BOOKING_SETTINGS, enabled: true, slug: "barbearia-teste" };
const publicRun = <T>(shopId: string, fn: Parameters<typeof withTenant<T>>[2]) => withTenant(db.appPool, { barbershopId: shopId, userId: NIL }, fn);
const book = (w: World, over: Partial<PublicBookingInput> = {}) =>
  publicRun(w.shop.id, (tx) =>
    createOnlineBookingCmd(tx, "Barbearia Teste", {
      serviceId: w.corte, barberId: "any", ymd: MONDAY, time: "10:00", name: "João da Silva", phone: "(11) 95555-0001", honeypot: "", ipHash: "hash-a", now: NOW, ...over,
    }),
  );

async function shopWithLink(name: string, slug: string, over: Partial<BookingSettings> = {}) {
  const w = await createWorld(db, name);
  unwrap(await db.as(w.owner, (tx) => saveBookingSettingsCmd(tx, w.owner, { ...settingsOn, slug, ...over })));
  return w;
}

describe("settings and the public lookup", () => {
  it("a barbershop with no settings has the link OFF; the owner turns it ON; the lookup finds only ON links, case-insensitive", async () => {
    const w = await createWorld(db, "Barbearia Config");
    expect(await db.as(w.owner, (tx) => getBookingSettings(tx))).toEqual(DEFAULT_BOOKING_SETTINGS);
    expect(await withPublic(db.appPool, (tx) => lookupShopBySlug(tx, "barbearia-config"))).toBeNull();
    unwrap(await db.as(w.owner, (tx) => saveBookingSettingsCmd(tx, w.owner, { ...settingsOn, slug: "barbearia-config" })));
    const found = await withPublic(db.appPool, (tx) => lookupShopBySlug(tx, " Barbearia-Config "));
    expect(found).toMatchObject({ barbershopId: w.shop.id, name: "Barbearia Config", timeZone: "America/Sao_Paulo", settings: { enabled: true, slug: "barbearia-config" } });
    unwrap(await db.as(w.owner, (tx) => saveBookingSettingsCmd(tx, w.owner, { ...settingsOn, slug: "barbearia-config", enabled: false })));
    expect(await withPublic(db.appPool, (tx) => lookupShopBySlug(tx, "barbearia-config"))).toBeNull();
  });

  it("only the owner changes it; the address is unique across barbershops; the change is audited", async () => {
    const a = await shopWithLink("Barbearia Slug A", "endereco-unico");
    const b = await createWorld(db, "Barbearia Slug B");
    expect(await db.as(a.rafael, (tx) => saveBookingSettingsCmd(tx, a.rafael, { ...settingsOn, slug: "outro-endereco" }))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.as(b.owner, (tx) => saveBookingSettingsCmd(tx, b.owner, { ...settingsOn, slug: "endereco-unico" }))).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect((await db.as(a.owner, (tx) => listAudit(tx, { action: "booking.settings_changed" }))).length).toBe(1);
  });

  it("the public lookup answers with ONE barbershop and nothing about the others; a barbershop never sees another one's settings", async () => {
    const a = await shopWithLink("Barbearia Isolada A", "isolada-a");
    const b = await shopWithLink("Barbearia Isolada B", "isolada-b");
    expect(await db.as(a.owner, (tx) => getBookingSettings(tx))).toMatchObject({ slug: "isolada-a" });
    const rows = await db.as(b.owner, (tx) => tx.query<{ slug: string }>("SELECT slug FROM booking_settings"));
    expect(rows).toEqual([{ slug: "isolada-b" }]);
    expect(await withPublic(db.appPool, (tx) => tx.query("SELECT * FROM booking_settings"))).toEqual([]);
  });

  it("the database refuses nonsense settings by itself", async () => {
    const w = await createWorld(db, "Barbearia Constraints");
    const insert = (cols: string, vals: unknown[]) =>
      db.adminPool.query(`INSERT INTO booking_settings (barbershop_id, ${cols}) VALUES ($1, ${vals.map((_, i) => `$${i + 2}`).join(", ")})`, [w.shop.id, ...vals]);
    await expectPgError(insert("enabled", [true]), PG.checkViolation); // ON without an address
    await expectPgError(insert("slug", ["Com Espaço"]), PG.checkViolation);
    await expectPgError(insert("slug", ["ab"]), PG.checkViolation);
    await expectPgError(insert("open_minute, close_minute", [600, 600]), PG.checkViolation);
    await expectPgError(insert("slot_minutes", [25]), PG.checkViolation);
    await expectPgError(insert("open_days", [0]), PG.checkViolation);
  });
});

describe("booking through the public page", () => {
  it("creates the client, the appointment with the service, marks it online, audits it, and the barber sees it on his agenda", async () => {
    const w = await shopWithLink("Barbearia Reserva", "reserva-1");
    const done = unwrap(await book(w, { barberId: w.rafael.userId }));
    expect(done).toMatchObject({ shopName: "Barbearia Teste", serviceName: "Corte", barberName: "Barbeiro rafael", status: "confirmed" });

    const comandas = await db.as(w.rafael, (tx) => listComandas(tx, { statuses: ["open"] }));
    expect(comandas).toHaveLength(1);
    const c = comandas[0];
    expect(c).toMatchObject({ online: { status: "confirmed" }, appointmentMinutes: 30, appointment: { barberId: w.rafael.userId }, status: "open" });
    expect(c.items.map((i) => [i.name, i.unitPrice, i.barberId])).toEqual([["Corte", 4500, w.rafael.userId]]);
    expect(c.appointment?.at.toISOString()).toBe(`${MONDAY}T13:00:00.000Z`); // 10:00 in São Paulo
    const client = (await db.adminPool.query("SELECT name, phone, notes FROM clients WHERE id = $1", [c.clientId])).rows[0];
    expect(client).toEqual({ name: "João da Silva", phone: "11955550001", notes: "Cadastrado pelo link de agendamento." });
    expect((await db.as(w.owner, (tx) => listAudit(tx, { action: "booking.created" }))).map((a) => a.userId)).toEqual(["online"]);
    const range = dayRange(new Date(`${MONDAY}T15:00:00Z`), "America/Sao_Paulo");
    expect(await db.as(w.diego, (tx) => listAppointments(tx, range.from, range.to))).toHaveLength(1); // RLS-visible; the RULES hide it from Diego's agenda
  });

  it("'any barber' spreads the work; when everybody is busy at that time the booking is refused", async () => {
    const w = await shopWithLink("Barbearia Qualquer", "qualquer-1");
    const first = unwrap(await book(w, { phone: "(11) 95555-0010" }));
    const second = unwrap(await book(w, { phone: "(11) 95555-0011" }));
    expect(new Set([first.barberName, second.barberName]).size).toBe(2); // two barbers, two different people
    expect(await book(w, { phone: "(11) 95555-0012" })).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });

  it("a barber who switched OFF 'takes online bookings' is not offered; the owner decides, and only he", async () => {
    const w = await shopWithLink("Barbearia Chave", "chave-1");
    expect((await db.as(w.owner, (tx) => listBookableBarbers(tx))).map((b) => b.name)).toEqual(["Barbeiro diego", "Barbeiro rafael"]); // the owner is not offered by default
    unwrap(await db.as(w.owner, (tx) => setTakesOnlineCmd(tx, w.owner, w.diego.userId, false)));
    expect((await db.as(w.owner, (tx) => listBookableBarbers(tx))).map((b) => b.name)).toEqual(["Barbeiro rafael"]);
    expect(await db.as(w.rafael, (tx) => setTakesOnlineCmd(tx, w.rafael, w.rafael.userId, false))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await book(w, { barberId: w.diego.userId })).toMatchObject({ ok: false });
    expect(unwrap(await book(w, { phone: "(11) 95555-0020" })).barberName).toBe("Barbeiro rafael");
  });

  it("an existing client (same phone) is reused: no duplicate, and the name typed on the page does NOT overwrite or reveal the real one", async () => {
    const w = await shopWithLink("Barbearia Cliente", "cliente-1");
    unwrap(await book(w, { name: "Marcos Lima", phone: "(11) 97777-2222" })); // Marcos already exists in the world with this phone
    expect((await db.adminPool.query("SELECT count(*)::int AS n FROM clients WHERE barbershop_id = $1 AND phone = '11977772222'", [w.shop.id])).rows[0].n).toBe(1);
    expect((await db.adminPool.query("SELECT name FROM clients WHERE id = $1", [w.marcos])).rows[0].name).toBe("Marcos Lima");
    const c = (await db.as(w.owner, (tx) => listComandas(tx, { statuses: ["open"] })))[0];
    expect(c.clientId).toBe(w.marcos);
  });

  it("the link OFF, the hidden field, a bad phone: nothing is saved", async () => {
    const w = await shopWithLink("Barbearia Recusa", "recusa-1");
    expect(await book(w, { honeypot: "spam" })).toMatchObject({ ok: false });
    expect(await book(w, { phone: "123" })).toMatchObject({ ok: false });
    expect(await book(w, { serviceId: "not-a-uuid" })).toMatchObject({ ok: false });
    expect(await book(w, { time: "07:00" })).toMatchObject({ ok: false });
    unwrap(await db.as(w.owner, (tx) => saveBookingSettingsCmd(tx, w.owner, { ...settingsOn, slug: "recusa-1", enabled: false })));
    expect(await book(w)).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect((await db.adminPool.query("SELECT count(*)::int AS n FROM comandas WHERE barbershop_id = $1", [w.shop.id])).rows[0].n).toBe(0);
  });

  it("a duration is respected: a 90-minute service blocks the next slots of the same barber", async () => {
    const w = await shopWithLink("Barbearia Duração", "duracao-1");
    await db.adminPool.query("UPDATE services SET duration_minutes = 90 WHERE id = $1", [w.corte]);
    await db.adminPool.query("UPDATE employees SET takes_online_bookings = false WHERE id = $1", [w.diego.userId]); // only Rafael
    unwrap(await book(w, { time: "10:00", phone: "(11) 95555-0030" }));
    expect(await book(w, { time: "10:30", phone: "(11) 95555-0031", serviceId: w.barba })).toMatchObject({ ok: false }); // inside the 90 minutes
    expect(await book(w, { time: "11:30", phone: "(11) 95555-0032", serviceId: w.barba })).toMatchObject({ ok: true });
  });
});

describe("two people at the same instant", () => {
  it("the same time for the same (only) barber: exactly ONE booking is saved (forced to really overlap)", async () => {
    const w = await shopWithLink("Barbearia Corrida", "corrida-1");
    await db.adminPool.query("UPDATE employees SET takes_online_bookings = false WHERE id = $1", [w.diego.userId]);
    const results = await withSlowWrites(db, "comandas", "NEW.source = 'online'", 0.4, () =>
      Promise.all([book(w, { phone: "(11) 95555-0040" }), book(w, { phone: "(11) 95555-0041" })]),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: { code: "INVALID_STATE" } });
    expect((await db.adminPool.query("SELECT count(*)::int AS n FROM comandas WHERE barbershop_id = $1 AND source = 'online'", [w.shop.id])).rows[0].n).toBe(1);
    // the loser's client was not left behind half-saved
    expect((await db.adminPool.query("SELECT count(*)::int AS n FROM clients WHERE barbershop_id = $1 AND phone IN ('11955550040','11955550041')", [w.shop.id])).rows[0].n).toBe(1);
  });
});

describe("limits against abuse", () => {
  it("a phone with 3 open online bookings cannot make a 4th", async () => {
    const w = await shopWithLink("Barbearia Limite Telefone", "limite-tel");
    for (const time of ["09:00", "10:00", "11:00"]) unwrap(await book(w, { time, phone: "(11) 95555-0050", ipHash: `ip-${time}` }));
    expect(await book(w, { time: "12:00", phone: "(11) 95555-0050", ipHash: "ip-x" })).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(unwrap(await book(w, { time: "12:00", phone: "(11) 95555-0051", ipHash: "ip-y" })).status).toBe("confirmed"); // another phone is fine
  });

  it("an address (hash) is limited to 5 bookings per hour", async () => {
    const w = await shopWithLink("Barbearia Limite Endereço", "limite-ip", { slotMinutes: 15 });
    const times = ["09:00", "09:15", "09:30", "09:45", "10:00"];
    for (const [i, time] of times.entries()) unwrap(await book(w, { time, phone: `(11) 95555-006${i}`, ipHash: "same-ip" }));
    expect(await book(w, { time: "10:30", phone: "(11) 95555-0069", ipHash: "same-ip" })).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(unwrap(await book(w, { time: "10:30", phone: "(11) 95555-0069", ipHash: "other-ip" })).status).toBe("confirmed");
  });
});

describe("approval mode", () => {
  it("bookings wait; they hold the time; the owner or the barber of the booking approves; others cannot", async () => {
    const w = await shopWithLink("Barbearia Aprova", "aprova-1", { requiresApproval: true });
    const done = unwrap(await book(w, { barberId: w.rafael.userId, phone: "(11) 95555-0070" }));
    expect(done.status).toBe("pending");
    expect(await book(w, { barberId: w.rafael.userId, phone: "(11) 95555-0071" })).toMatchObject({ ok: false }); // the time is held while waiting
    const [pending] = await db.as(w.owner, (tx) => listWaitingApproval(tx));
    expect(pending.online?.status).toBe("pending");
    expect(await db.as(w.diego, (tx) => approveBookingCmd(tx, w.diego, pending.id))).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    unwrap(await db.as(w.rafael, (tx) => approveBookingCmd(tx, w.rafael, pending.id)));
    expect((await db.as(w.owner, (tx) => getComanda(tx, pending.id)))?.online?.status).toBe("confirmed");
    expect(await db.as(w.owner, (tx) => listWaitingApproval(tx))).toEqual([]);
    expect(await db.as(w.owner, (tx) => approveBookingCmd(tx, w.owner, pending.id))).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
  });

  it("declining needs a reason, cancels it with the person's name and FREES the time again", async () => {
    const w = await shopWithLink("Barbearia Recusa Pedido", "recusa-2", { requiresApproval: true });
    unwrap(await book(w, { barberId: w.rafael.userId, phone: "(11) 95555-0080" }));
    const [pending] = await db.as(w.owner, (tx) => listWaitingApproval(tx));
    expect(await db.as(w.owner, (tx) => declineBookingCmd(tx, w.owner, pending.id, " "))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    unwrap(await db.as(w.owner, (tx) => declineBookingCmd(tx, w.owner, pending.id, "Barbeiro de folga")));
    expect(await db.as(w.owner, (tx) => getComanda(tx, pending.id))).toMatchObject({ status: "cancelled", cancellation: { reason: "Recusado: Barbeiro de folga", by: w.owner.userId } });
    expect(await book(w, { barberId: w.rafael.userId, phone: "(11) 95555-0081" })).toMatchObject({ ok: true }); // the same time is free again
    expect((await db.as(w.owner, (tx) => listAudit(tx, { action: "booking.declined" }))).length).toBe(1);
  });

  it("another barbershop cannot approve it", async () => {
    const a = await shopWithLink("Barbearia Dona", "dona-1", { requiresApproval: true });
    const b = await createWorld(db, "Barbearia Intrusa");
    unwrap(await book(a, { phone: "(11) 95555-0090" }));
    const [pending] = await db.as(a.owner, (tx) => listWaitingApproval(tx));
    expect(await db.as(b.owner, (tx) => approveBookingCmd(tx, b.owner, pending.id))).toMatchObject({ ok: false, error: { code: "WRONG_TENANT" } });
  });
});

describe("what the database guarantees about online comandas", () => {
  it("online <=> has a status; the address hash exists only for online ones; a status needs an appointment", async () => {
    const w = await createWorld(db, "Barbearia Regras do Banco");
    const base = [w.shop.id, w.rafael.userId];
    const insert = (extra: string, vals: unknown[]) =>
      db.adminPool.query(
        `INSERT INTO comandas (barbershop_id, number, opened_by, opened_at, status, ${extra}) VALUES ($1, floor(random()*1e6)::int + 1, $2, now(), 'open', ${vals.map((_, i) => `$${i + 3}`).join(", ")})`,
        [...base, ...vals],
      );
    await expectPgError(insert("source", ["online"]), PG.checkViolation); // online without a status
    await expectPgError(insert("online_status", ["pending"]), PG.checkViolation); // a status without source online
    await expectPgError(insert("online_ip_hash", ["abc"]), PG.checkViolation); // a hash on a staff comanda
    await expectPgError(insert("source, online_status", ["online", "pending"]), PG.checkViolation); // pending without an appointment
    await expectPgError(insert("appointment_minutes", [3]), PG.checkViolation);
  });
});
