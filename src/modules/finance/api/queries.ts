import "server-only";
import { loadWorld } from "@/server/lookups";
import { read } from "@/server/run";
import { clockTime, monthRange, relativeDay } from "@/shared/time";
import type { Cents } from "@/shared/money";
import { barberTotals, topServices } from "@/modules/service-orders/data/reports.repo";
import { getOpenRegisterReport } from "../data/commands";
import { getLastClosedRegister, getOpenRegister } from "../data/registers.repo";
import { moneyTotals } from "../data/reports.repo";
import { suggestedOpeningCash, type PaymentMethod } from "../rules/cash-register";

export type CashPage =
  | { kind: "closed" }
  | {
      kind: "open";
      openedLabel: string;
      expectedCash: Cents;
      byMethod: Record<PaymentMethod, Cents>;
      movements: { id: number; time: string; description: string; amount: Cents; method: PaymentMethod }[];
    };

export async function loadCashPage(): Promise<CashPage> {
  return read(async (tx) => {
    const world = await loadWorld(tx);
    const report = await getOpenRegisterReport(tx);
    if (!report) return { kind: "closed" };
    const day = relativeDay(report.register.openedAt, world.now, world.timeZone);
    return {
      kind: "open",
      openedLabel: `${day === "Hoje" ? "" : `${day} `}${clockTime(report.register.openedAt, world.timeZone)} por ${world.employeeName(report.register.openedBy)}`,
      expectedCash: report.expectedCash,
      byMethod: report.salesByMethod,
      movements: report.movements.map((m, index) => ({
        id: index,
        time: clockTime(m.at, world.timeZone),
        description: m.description,
        amount: m.amount,
        method: m.method,
      })),
    };
  });
}

export type OpenCashPage = { alreadyOpen: boolean; leftYesterday: Cents | null; whoLabel: string };

export async function loadOpenCashPage(): Promise<OpenCashPage> {
  return read(async (tx, ctx) => {
    const world = await loadWorld(tx);
    return {
      alreadyOpen: (await getOpenRegister(tx)) !== null,
      leftYesterday: suggestedOpeningCash(await getLastClosedRegister(tx)),
      whoLabel: world.employeeName(ctx.userId),
    };
  });
}

export type ReportsPage = {
  label: string;
  income: Cents;
  expenses: Cents;
  withdrawals: Cents;
  byBarber: { name: string; comandas: number; revenue: Cents }[];
  byMethod: Record<PaymentMethod, Cents>;
  topServices: { name: string; count: number }[];
};

/** The current month, in the barbershop's time zone. */
export async function loadReports(): Promise<ReportsPage> {
  return read(async (tx) => {
    const world = await loadWorld(tx);
    const { from, to, label } = monthRange(world.now, world.timeZone);
    const money = await moneyTotals(tx, from, to);
    const barbers = await barberTotals(tx, from, to);
    const services = await topServices(tx, from, to, 5);
    return {
      label,
      income: money.income,
      expenses: money.expenses,
      withdrawals: money.withdrawals,
      byMethod: money.byMethod,
      byBarber: barbers.map((b) => ({ name: world.employeeName(b.barberId), comandas: b.comandas, revenue: b.revenue })),
      topServices: services,
    };
  });
}
