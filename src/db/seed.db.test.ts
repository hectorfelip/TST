/** A whole day of work, saved through the real commands, matches the day the prototype shows. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "@/db/audit";
import { getOpenRegisterReport } from "@/modules/finance/data/commands";
import { listEmployees } from "@/modules/employees/data/employees.repo";
import { listProducts } from "@/modules/inventory/data/inventory.repo";
import { listServices } from "@/modules/services/data/services.repo";
import { agendaBetween } from "@/modules/service-orders/rules/appointments";
import { planDayCloseCmd } from "@/modules/service-orders/data/commands";
import { listAppointments, listComandas } from "@/modules/service-orders/data/comandas.repo";
import { createTestDb, type TestDb } from "@/test/db/helpers";
import { unwrap } from "@/shared/result";
import { dayRange } from "@/shared/time";
import { seedDemo } from "./seed";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe("demo data", () => {
  it("builds the day of the prototype: cash R$ 128,50, 3 paid comandas, today's and tomorrow's agenda, low stock", async () => {
    const now = new Date("2026-09-29T13:35:00Z"); // 10:35 in São Paulo
    const s = await seedDemo(db.adminPool, db.appPool, now);

    const report = await db.as(s.owner, (tx) => getOpenRegisterReport(tx));
    expect(report?.expectedCash).toBe(12850); // 100,00 + 47,00 cash sale - 18,50 coffee
    expect(report?.salesByMethod).toEqual({ cash: 4700, pix: 6000, debit: 0, credit: 10990 });

    const comandas = await db.as(s.owner, (tx) => listComandas(tx));
    expect(comandas.filter((c) => c.status === "closed")).toHaveLength(3);
    expect(comandas.filter((c) => c.status === "no_show")).toHaveLength(1);

    const today = dayRange(now, "America/Sao_Paulo");
    const tomorrow = dayRange(now, "America/Sao_Paulo", 1);
    const all = await db.as(s.owner, (tx) => listAppointments(tx, today.from, tomorrow.to));
    expect(agendaBetween(s.owner, all, today)).toHaveLength(3);
    expect(agendaBetween(s.owner, all, tomorrow)).toHaveLength(2);
    expect(agendaBetween(s.rafael, all, today).map((c) => c.appointment?.at.toISOString())).toEqual(["2026-09-29T13:00:00.000Z", "2026-09-29T14:00:00.000Z"]); // 10:00 and 11:00
    expect(agendaBetween(s.rafael, all, tomorrow)).toHaveLength(1);
    expect(agendaBetween(s.diego, all, tomorrow)).toHaveLength(1);

    const products = await db.as(s.owner, (tx) => listProducts(tx));
    expect(products.filter((p) => p.stock < p.minStock).map((p) => p.name).sort()).toEqual(["Lâmina descartável (cx)", "Pomada modeladora"]);

    expect((await db.as(s.owner, (tx) => listServices(tx))).filter((x) => x.active)).toHaveLength(5);
    expect((await db.as(s.owner, (tx) => listEmployees(tx))).filter((e) => e.active)).toHaveLength(3);
    expect(await db.as(s.owner, (tx) => listAudit(tx, { action: "comanda.no_show" }))).toHaveLength(1);
  });

  it("closing that day alerts every unpaid service (the 'Fechar caixa' screen)", async () => {
    const now = new Date("2026-09-29T22:00:00Z"); // evening
    const s = await seedDemo(db.adminPool, db.appPool, now, "2");
    const plan = unwrap(await db.as(s.owner, (tx) => planDayCloseCmd(tx, s.owner, new Date("2026-09-30T01:00:00Z"))));
    expect(plan.entries.length).toBeGreaterThanOrEqual(5);
    expect(plan.entries.some((e) => e.kind === "no_show_with_items")).toBe(true);
    expect(plan.entries.some((e) => e.kind === "unpaid" && e.options.includes("no_show"))).toBe(true);
  });
});
