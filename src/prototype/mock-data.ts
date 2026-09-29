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
  status: "aberta" | "fechada" | "cancelada";
  items: ComandaItem[];
  payment?: PaymentMethod;
};

export const comandas: Comanda[] = [
  {
    id: "1027", number: 1027, clientId: "c3", openedAt: "10:32", status: "aberta",
    items: [
      { kind: "servico", name: "Corte + Barba", price: 7000, barberId: "e2" },
      { kind: "produto", name: "Pomada modeladora", price: 4500, barberId: "e2" },
    ],
  },
  {
    id: "1026", number: 1026, clientId: null, openedAt: "10:15", status: "aberta",
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e3" }],
  },
  { id: "1025", number: 1025, clientId: "c1", openedAt: "10:05", status: "aberta", items: [] },
  {
    id: "1024", number: 1024, clientId: "c2", openedAt: "09:40", status: "fechada", payment: "pix",
    items: [
      { kind: "servico", name: "Corte", price: 4500, barberId: "e1" },
      { kind: "servico", name: "Sobrancelha", price: 1500, barberId: "e1" },
    ],
  },
  {
    id: "1023", number: 1023, clientId: null, openedAt: "09:10", status: "fechada", payment: "dinheiro",
    items: [
      { kind: "servico", name: "Barba", price: 3500, barberId: "e3" },
      { kind: "produto", name: "Cerveja long neck", price: 1200, barberId: "e3" },
    ],
  },
  {
    id: "1022", number: 1022, clientId: "c4", openedAt: "09:02", status: "cancelada",
    items: [{ kind: "servico", name: "Corte", price: 4500, barberId: "e2" }],
  },
];

export const cashRegister = {
  status: "aberto" as const,
  openedAt: "09:00",
  openedBy: "Carlos",
  openingCash: 10000,
  byMethod: { dinheiro: 4700, pix: 6000, debito: 0, credito: 0 } satisfies Record<PaymentMethod, Cents>,
  movements: [
    { time: "09:00", description: "Abertura do caixa (troco)", amount: 10000 },
    { time: "09:25", description: "Comanda #1023", amount: 4700 },
    { time: "09:58", description: "Comanda #1024", amount: 6000 },
    { time: "10:20", description: "Despesa: café e açúcar", amount: -1850 },
  ],
};

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
