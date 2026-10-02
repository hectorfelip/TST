/**
 * PROTOTYPE ONLY (step 2). Fake data so the screens can be clicked and shown
 * to barbershop owners. Replaced by real data access in steps 4 and 5.
 */
import type { Cents } from "@/shared/money";

export type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito";

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
};

export const barbershop = { name: "Barbearia Exemplo" };

export const employees = [
  { id: "e1", name: "Carlos", role: "owner" as const, active: true },
  { id: "e2", name: "Rafael", role: "barber" as const, active: true },
  { id: "e3", name: "Diego", role: "barber" as const, active: true },
  { id: "e4", name: "Bruno", role: "barber" as const, active: false },
];

export const services = [
  { id: "s1", name: "Corte", price: 4500, minutes: 30, favorite: true, active: true },
  { id: "s2", name: "Barba", price: 3500, minutes: 20, favorite: true, active: true },
  { id: "s3", name: "Corte + Barba", price: 7000, minutes: 50, favorite: true, active: true },
  { id: "s4", name: "Pezinho", price: 2000, minutes: 10, favorite: true, active: true },
  { id: "s5", name: "Sobrancelha", price: 1500, minutes: 10, favorite: false, active: true },
  { id: "s6", name: "Luzes", price: 12000, minutes: 90, favorite: false, active: false },
];

export const products = [
  { id: "p1", name: "Pomada modeladora", price: 4500, stock: 2, minStock: 5, use: "venda" as const },
  { id: "p2", name: "Óleo para barba", price: 3990, stock: 8, minStock: 3, use: "venda" as const },
  { id: "p3", name: "Cerveja long neck", price: 1200, stock: 24, minStock: 12, use: "venda" as const },
  { id: "p4", name: "Lâmina descartável (cx)", price: 0, stock: 1, minStock: 2, use: "interno" as const },
  { id: "p5", name: "Shampoo 1L", price: 0, stock: 3, minStock: 1, use: "interno" as const },
];

export const clients = [
  { id: "c1", name: "André Souza", phone: "(11) 98888-1111", lastVisitDaysAgo: 7, visits: 14, notes: "Corte baixo nas laterais, máquina 1." },
  { id: "c2", name: "Marcos Lima", phone: "(11) 97777-2222", lastVisitDaysAgo: 48, visits: 6, notes: "" },
  { id: "c3", name: "Pedro Alves", phone: "(11) 96666-3333", lastVisitDaysAgo: 2, visits: 21, notes: "Prefere o Rafael." },
  { id: "c4", name: "Lucas Rocha", phone: "(11) 95555-4444", lastVisitDaysAgo: 95, visits: 2, notes: "" },
];

export type ComandaItem = {
  kind: "servico" | "produto";
  name: string;
  price: Cents;
  barberId: string;
};

export type Comanda = {
  id: string;
  number: number;
  clientId: string | null; // null = walk-in client ("cliente avulso")
  openedAt: string;
  openedBy: string; // employee id
  status: "aberta" | "fechada" | "cancelada" | "nao_compareceu";
  items: ComandaItem[];
  payment?: PaymentMethod;
  /** Set when this comanda is an appointment ("agendamento"). */
  appointment?: { day: "hoje" | "amanha"; time: string; barberId: string };
  /** Days since the owner chose "keep pending" at closing. Expires after PENDING_EXPIRY_DAYS. */
  pendingDaysAgo?: number;
};

export const PENDING_EXPIRY_DAYS = 5;
/** The prototype's "now" for the day screens (Tuesday 29/09). */
export const NOW_LABEL = "10:35";

export const comandas: Comanda[] = [
  {
    id: "1027", number: 1027, openedBy: "e2", clientId: "c3", openedAt: "10:32", status: "aberta",
    items: [
      { kind: "servico", name: "Corte + Barba", price: 7000, barberId: "e2" },
      { kind: "produto", name: "Pomada modeladora", price: 4500, barberId: "e2" },
    ],
  },
  {
    id: "1026", number: 1026, openedBy: "e3", clientId: null, openedAt: "10:15", status: "aberta",
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e3" }],
  },
  {
    id: "1025", number: 1025, openedBy: "e2", clientId: "c1", openedAt: "Ontem 18:10", status: "aberta", items: [],
    appointment: { day: "hoje", time: "11:00", barberId: "e2" },
  },
  {
    id: "1030", number: 1030, openedBy: "e1", clientId: "c2", openedAt: "Ontem 17:20", status: "aberta",
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e2" }],
    appointment: { day: "hoje", time: "10:00", barberId: "e2" },
  },
  {
    id: "1032", number: 1032, openedBy: "e1", clientId: "c4", openedAt: "Ontem 17:45", status: "aberta",
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e3" }],
    appointment: { day: "hoje", time: "15:00", barberId: "e3" },
  },
  {
    id: "1033", number: 1033, openedBy: "e2", clientId: "c3", openedAt: "Hoje 09:50", status: "aberta",
    items: [{ kind: "servico", name: "Corte + Barba", price: 7000, barberId: "e2" }],
    appointment: { day: "amanha", time: "10:00", barberId: "e2" },
  },
  {
    id: "1034", number: 1034, openedBy: "e1", clientId: "c2", openedAt: "Hoje 10:10", status: "aberta", items: [],
    appointment: { day: "amanha", time: "11:30", barberId: "e3" },
  },
  { id: "1035", number: 1035, openedBy: "e2", clientId: null, openedAt: "10:30", status: "aberta", items: [] },
  {
    id: "1020", number: 1020, openedBy: "e3", clientId: "c1", openedAt: "Ontem 17:00", status: "nao_compareceu",
    items: [{ kind: "servico", name: "Barba", price: 3500, barberId: "e3" }],
    appointment: { day: "hoje", time: "09:30", barberId: "e3" },
  },
  {
    id: "1019", number: 1019, openedBy: "e3", clientId: "c2", openedAt: "Ontem 16:40", status: "aberta", pendingDaysAgo: 3,
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e3" }],
  },
  {
    id: "1024", number: 1024, openedBy: "e1", clientId: "c2", openedAt: "09:40", status: "fechada", payment: "pix",
    items: [
      { kind: "servico", name: "Corte", price: 4500, barberId: "e1" },
      { kind: "servico", name: "Sobrancelha", price: 1500, barberId: "e1" },
    ],
  },
  {
    id: "1023", number: 1023, openedBy: "e3", clientId: null, openedAt: "09:10", status: "fechada", payment: "dinheiro",
    items: [
      { kind: "servico", name: "Barba", price: 3500, barberId: "e3" },
      { kind: "produto", name: "Cerveja long neck", price: 1200, barberId: "e3" },
    ],
  },
  {
    id: "1021", number: 1021, openedBy: "e2", clientId: "c3", openedAt: "09:05", status: "fechada", payment: "credito",
    items: [
      { kind: "servico", name: "Corte + Barba", price: 7000, barberId: "e2" },
      { kind: "produto", name: "Óleo para barba", price: 3990, barberId: "e2" },
    ],
  },
  {
    id: "1022", number: 1022, openedBy: "e2", clientId: "c4", openedAt: "09:02", status: "cancelada",
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e2" }],
  },
];

export type CashMovement = {
  time: string;
  description: string;
  amount: Cents; // negative = money out
  method: PaymentMethod;
};

const movements: CashMovement[] = [
  { time: "09:00", description: "Abertura do caixa (troco)", amount: 10000, method: "dinheiro" },
  { time: "09:12", description: "Comanda #1021", amount: 10990, method: "credito" },
  { time: "09:25", description: "Comanda #1023", amount: 4700, method: "dinheiro" },
  { time: "09:58", description: "Comanda #1024", amount: 6000, method: "pix" },
  { time: "10:20", description: "Despesa: café e açúcar", amount: -1850, method: "dinheiro" },
];

export const cashRegister = {
  status: "aberto" as const,
  openedAt: "09:00",
  openedBy: "Carlos",
  movements,
};

/** Money received from comandas, per payment method (opening cash and expenses excluded). */
export function receivedByMethod(list: CashMovement[]): Record<PaymentMethod, Cents> {
  const totals: Record<PaymentMethod, Cents> = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
  for (const m of list) {
    if (m.description.startsWith("Comanda")) totals[m.method] += m.amount;
  }
  return totals;
}

/** Only physical cash stays in the drawer: Pix and card never enter it. */
export function expectedCashInDrawer(list: CashMovement[]): Cents {
  return list.filter((m) => m.method === "dinheiro").reduce((sum, m) => sum + m.amount, 0);
}

export const monthReport = {
  label: "Setembro 2026",
  income: 1845000,
  expenses: 612000,
  byBarber: [
    { name: "Carlos", comandas: 142, revenue: 712000 },
    { name: "Rafael", comandas: 131, revenue: 648000 },
    { name: "Diego", comandas: 98, revenue: 485000 },
  ],
  byMethod: { dinheiro: 312000, pix: 986000, debito: 301000, credito: 246000 } satisfies Record<PaymentMethod, Cents>,
  topServices: [
    { name: "Corte", count: 198 },
    { name: "Corte + Barba", count: 121 },
    { name: "Barba", count: 64 },
  ],
};

/** Barber sees comandas he opened or where he did at least one item. */
export function isComandaOf(comanda: Comanda, employeeId: string): boolean {
  return (
    comanda.openedBy === employeeId ||
    comanda.appointment?.barberId === employeeId ||
    comanda.items.some((i) => i.barberId === employeeId)
  );
}

export function appointmentLabel(comanda: Comanda): string {
  if (!comanda.appointment) return "";
  return `${comanda.appointment.day === "hoje" ? "Hoje" : "Amanhã"} ${comanda.appointment.time}`;
}

/** Has the appointment time already passed (today, relative to NOW_LABEL)? Only then "não compareceu" is allowed. */
export function appointmentTimePassed(comanda: Comanda): boolean {
  const a = comanda.appointment;
  return !!a && a.day === "hoje" && a.time <= NOW_LABEL;
}

/** Appointments (open) for a day, earliest first. */
export function agendaOf(day: "hoje" | "amanha", barberId: string | null): Comanda[] {
  return comandas
    .filter((c) => c.status === "aberta" && c.appointment?.day === day)
    .filter((c) => barberId === null || isComandaOf(c, barberId))
    .sort((a, b) => a.appointment!.time.localeCompare(b.appointment!.time));
}

/** Open comandas that belong to the day (appointments of tomorrow are not "open today"). */
export function openToday(): Comanda[] {
  return comandas.filter((c) => c.status === "aberta" && c.appointment?.day !== "amanha");
}

export function noShowCountOf(clientId: string): number {
  return comandas.filter((c) => c.status === "nao_compareceu" && c.clientId === clientId).length;
}

export type DayDecision = "no_show" | "keep_pending" | "discard" | "reviewed";

export type DayEntry = {
  id: string;
  number: number;
  kind: "unpaid" | "empty" | "no_show_with_items";
  client: string;
  barber: string;
  appointment: string | null;
  items: string[];
  total: Cents;
  options: DayDecision[];
  expiresInDays: number | null;
};

/**
 * The list the owner must go through when closing the register (mirrors
 * planDayClose in the rules). The prototype treats the closing as the end of
 * the day: every appointment of today is already due.
 */
export function dayCloseEntries(): DayEntry[] {
  const entries: DayEntry[] = [];
  for (const c of comandas) {
    const base = {
      id: c.id,
      number: c.number,
      client: clientName(c.clientId),
      barber: employeeName(c.appointment?.barberId ?? c.items[0]?.barberId ?? c.openedBy),
      appointment: c.appointment ? appointmentLabel(c) : null,
      items: c.items.map((i) => i.name),
      total: comandaTotal(c),
    };
    if (c.status === "aberta" && c.appointment?.day !== "amanha") {
      if (c.items.length > 0) {
        entries.push({
          ...base,
          kind: "unpaid",
          options: c.appointment ? ["no_show", "keep_pending"] : ["keep_pending"],
          expiresInDays: c.pendingDaysAgo === undefined ? null : Math.max(0, PENDING_EXPIRY_DAYS - c.pendingDaysAgo),
        });
      } else {
        entries.push({ ...base, kind: "empty", options: c.appointment ? ["no_show"] : ["discard"], expiresInDays: null });
      }
    } else if (c.status === "nao_compareceu" && c.items.length > 0) {
      entries.push({ ...base, kind: "no_show_with_items", options: ["reviewed"], expiresInDays: null });
    }
  }
  return entries.sort((a, b) => a.number - b.number);
}

/** Revenue of one barber = sum of the items he did (not the whole comanda). */
export function barberRevenue(comanda: Comanda, employeeId: string): Cents {
  return comanda.items.filter((i) => i.barberId === employeeId).reduce((sum, i) => sum + i.price, 0);
}

export function comandaTotal(comanda: Comanda): Cents {
  return comanda.items.reduce((sum, item) => sum + item.price, 0);
}

export function clientName(clientId: string | null): string {
  if (!clientId) return "Cliente avulso";
  return clients.find((c) => c.id === clientId)?.name ?? "Cliente removido";
}

export function employeeName(id: string): string {
  return employees.find((e) => e.id === id)?.name ?? "—";
}
