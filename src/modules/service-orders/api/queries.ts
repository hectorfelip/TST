import "server-only";
/**
 * Reading for the screens of the day: dashboard, comandas, agenda, one comanda, closing the register.
 * Every function asks "who is logged in?" itself (through `read`), applies the visibility rules
 * (a barber sees only his own comandas) and returns plain objects from views.ts.
 */
import { getOpenRegister } from "@/modules/finance/data/registers.repo";
import { getOpenRegisterReport } from "@/modules/finance/data/commands";
import { can } from "@/modules/auth/rules/permissions";
import { listProducts } from "@/modules/inventory/data/inventory.repo";
import { isLowStock } from "@/modules/inventory/rules/stock";
import { listServices } from "@/modules/services/data/services.repo";
import { loadWorld } from "@/server/lookups";
import { read } from "@/server/run";
import { clockTime, dayRange, dayTitle, relativeDay } from "@/shared/time";
import type { Cents } from "@/shared/money";
import type { Role } from "@/shared/tenant";
import { barberRevenue } from "../rules/totals";
import { agendaBetween } from "../rules/appointments";
import { canView, comandaTotal, isComandaOf, type Comanda } from "../rules/comanda";
import type { DayDecision } from "../rules/day-close";
import { planDayCloseCmd } from "../data/commands";
import { getComanda, listAppointments, listClosedBetween, listComandas, listFinishedBetween } from "../data/comandas.repo";
import { toComandaView, type ComandaView } from "./views";

export type Board = {
  title: string;
  role: Role;
  /** Open today (appointments for tomorrow live in the agenda) and pending ones. */
  open: ComandaView[];
  /** Paid, cancelled or no-show today. */
  done: ComandaView[];
  agendaToday: ComandaView[];
  agendaTomorrow: ComandaView[];
};

/** Everything the day screens share. */
async function dayData() {
  return read(async (tx, ctx) => {
    const world = await loadWorld(tx);
    const today = dayRange(world.now, world.timeZone);
    const tomorrow = dayRange(world.now, world.timeZone, 1);
    const [openAll, finished, appointmentsToday, appointmentsTomorrow] = await Promise.all([
      listComandas(tx, { statuses: ["open"], limit: 500 }),
      listFinishedBetween(tx, today.from, today.to),
      listAppointments(tx, today.from, today.to),
      listAppointments(tx, tomorrow.from, tomorrow.to),
    ]);
    const mine = (c: Comanda) => canView(ctx, c);
    const startOfTomorrow = tomorrow.from.getTime();
    return {
      ctx,
      world,
      today,
      tomorrow,
      open: openAll.filter(mine).filter((c) => !c.appointment || c.appointment.at.getTime() < startOfTomorrow),
      finished: finished.filter(mine),
      agendaToday: agendaBetween(ctx, appointmentsToday, today),
      agendaTomorrow: agendaBetween(ctx, appointmentsTomorrow, tomorrow),
    };
  });
}

export async function loadBoard(): Promise<Board> {
  const d = await dayData();
  const view = (c: Parameters<typeof toComandaView>[0]) => toComandaView(c, d.world);
  return {
    title: dayTitle(d.world.now, d.world.timeZone),
    role: d.ctx.role,
    open: d.open.map(view),
    done: d.finished.map(view),
    agendaToday: d.agendaToday.map(view),
    agendaTomorrow: d.agendaTomorrow.map(view),
  };
}

export type Dashboard =
  | {
      role: "owner";
      title: string;
      revenue: Cents;
      closedCount: number;
      averageTicket: Cents;
      register: { openedAtLabel: string; openedBy: string } | null;
      agendaToday: ComandaView[];
      pending: ComandaView[];
      open: ComandaView[];
      lowStock: { id: string; name: string; stock: number; minStock: number }[];
    }
  | { role: "barber"; title: string; revenue: Cents; closedCount: number; agendaToday: ComandaView[]; agendaTomorrow: ComandaView[]; open: ComandaView[] };

export async function loadDashboard(): Promise<Dashboard> {
  const d = await dayData();
  const { ctx, world } = d;
  const view = (c: Parameters<typeof toComandaView>[0]) => toComandaView(c, world);
  const closedToday = await read((tx) => listClosedBetween(tx, d.today.from, d.today.to));
  const title = dayTitle(world.now, world.timeZone);

  if (ctx.role === "barber") {
    const mine = closedToday.filter((c) => isComandaOf(c, ctx.userId));
    return {
      role: "barber",
      title,
      // Revenue of a barber = the items HE did, after his share of any discount (rule R-CMD-13). Not a commission.
      revenue: mine.reduce((sum, c) => sum + barberRevenue(c, ctx.userId), 0),
      closedCount: mine.length,
      agendaToday: d.agendaToday.map(view),
      agendaTomorrow: d.agendaTomorrow.map(view),
      open: d.open.map(view),
    };
  }

  const { register, lowStock } = await read(async (tx) => ({
    register: await getOpenRegister(tx),
    lowStock: (await listProducts(tx)).filter((p) => p.active && isLowStock(p)),
  }));
  const revenue = closedToday.reduce((sum, c) => sum + comandaTotal(c), 0);
  return {
    role: "owner",
    title,
    revenue,
    closedCount: closedToday.length,
    averageTicket: closedToday.length ? Math.round(revenue / closedToday.length) : 0,
    register: register
      ? {
          openedAtLabel: `${relativeDay(register.openedAt, world.now, world.timeZone) === "Hoje" ? "" : `${relativeDay(register.openedAt, world.now, world.timeZone)} `}${clockTime(register.openedAt, world.timeZone)}`,
          openedBy: world.employeeName(register.openedBy),
        }
      : null,
    agendaToday: d.agendaToday.map(view),
    pending: d.open.filter((c) => c.pendingSince).map(view),
    open: d.open.map(view),
    lowStock: lowStock.map((p) => ({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock })),
  };
}

export type ComandaPage =
  | { kind: "missing" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      comanda: ComandaView;
      role: Role;
      /** The person may change this comanda (own or any, and it is open). */
      canEdit: boolean;
      registerOpen: boolean;
      services: { id: string; name: string; price: Cents; favorite: boolean }[];
      forSale: { id: string; name: string; price: Cents; stock: number }[];
      barbers: { id: string; name: string }[];
    };

export async function loadComandaPage(id: string): Promise<ComandaPage> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { kind: "missing" };
  return read(async (tx, ctx) => {
    const comanda = await getComanda(tx, id);
    if (!comanda) return { kind: "missing" };
    if (!canView(ctx, comanda)) return { kind: "forbidden" };
    const world = await loadWorld(tx);
    const [services, products, register] = await Promise.all([listServices(tx), listProducts(tx), getOpenRegister(tx)]);
    const isOpen = comanda.status === "open";
    return {
      kind: "ok",
      comanda: toComandaView(comanda, world),
      role: ctx.role,
      canEdit: isOpen && (can(ctx.role, "comanda.edit_any") || isComandaOf(comanda, ctx.userId)),
      registerOpen: register !== null,
      services: services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, price: s.price, favorite: s.favorite })),
      forSale: products.filter((p) => p.active && p.use === "sale").map((p) => ({ id: p.id, name: p.name, price: p.salePrice ?? 0, stock: p.stock })),
      barbers: world.employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name })),
    };
  });
}

export type DayEntryView = {
  id: string;
  number: number;
  kind: "unpaid" | "empty" | "no_show_with_items";
  client: string;
  barber: string;
  appointment: string | null;
  items: string[];
  total: Cents;
  options: DayDecision[];
  isPending: boolean;
  expiresInDays: number | null;
};

export type CloseCashPage =
  | { kind: "no_register" }
  | { kind: "ok"; openedLabel: string; expected: Cents; entries: DayEntryView[]; expiryDays: number | null };

/** The "Fechar caixa" screen: what the drawer should hold and every comanda the owner must decide about. */
export async function loadCloseCash(): Promise<CloseCashPage> {
  return read(async (tx, ctx) => {
    const world = await loadWorld(tx);
    const report = await getOpenRegisterReport(tx);
    if (!report) return { kind: "no_register" };
    const plan = await planDayCloseCmd(tx, ctx, world.now);
    if (!plan.ok) return { kind: "no_register" };
    return {
      kind: "ok",
      openedLabel: `${clockTime(report.register.openedAt, world.timeZone)} por ${world.employeeName(report.register.openedBy)}`,
      expected: report.expectedCash,
      expiryDays: world.expiryDays,
      entries: plan.value.entries.map((e) => {
        const v = toComandaView(e.comanda, world);
        return {
          id: v.id,
          number: v.number,
          kind: e.kind,
          client: v.clientName,
          barber: world.employeeName(e.comanda.appointment?.barberId ?? e.comanda.items[0]?.barberId ?? e.comanda.openedBy),
          appointment: v.appointment?.label ?? null,
          items: v.items.map((i) => i.name),
          total: e.total,
          options: e.options,
          isPending: e.comanda.pendingSince !== null,
          expiresInDays: e.expiresInDays,
        };
      }),
    };
  });
}
