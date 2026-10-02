/**
 * What the screens receive: small, flat objects with everything already in words and cents.
 * A screen never gets a database row, a Date it must interpret, or a field it should not show
 * (phones, other barbers' data...). Pure functions: tested without a database.
 */
import type { PaymentMethod } from "@/modules/finance/rules/cash-register";
import { ANONYMIZED_NAME } from "@/modules/clients/rules/clients";
import type { Cents } from "@/shared/money";
import { clockTime, relativeDay } from "@/shared/time";
import { comandaSubtotal, comandaTotal, type Comanda, type ComandaStatus } from "../rules/comanda";
import { pendingDaysLeft } from "../rules/day-close";

/** What the mapper needs to know about the world. Built once per request. */
export type Lookups = {
  now: Date;
  timeZone: string;
  /** null = the barbershop does not cancel pending comandas by itself. */
  expiryDays: number | null;
  employeeName: (id: string) => string;
  clientName: (id: string | null) => string;
};

export type ComandaItemView = {
  id: string;
  kind: "service" | "product";
  name: string;
  unitPrice: Cents;
  quantity: number;
  lineTotal: Cents;
  barberId: string;
  barberName: string;
  soldWithoutStock: boolean;
};

export type ComandaView = {
  id: string;
  number: number;
  status: ComandaStatus;
  clientId: string | null;
  clientName: string;
  openedAtLabel: string;
  items: ComandaItemView[];
  subtotal: Cents;
  discount: Cents;
  total: Cents;
  paymentMethod: PaymentMethod | null;
  paymentChange: Cents | null;
  note: string | null;
  appointment: { label: string; time: string; barberId: string; barberName: string; timePassed: boolean } | null;
  /** null = not pending. `daysLeft` null = pending, but this barbershop never cancels by itself. */
  pending: { daysLeft: number | null } | null;
  cancellationReason: string | null;
  /** Names of the barbers who did something in it, or "Sem itens". */
  barbersLabel: string;
};

export const WALK_IN_LABEL = "Cliente avulso";

export function toComandaView(c: Comanda, lookups: Lookups): ComandaView {
  const { now, timeZone } = lookups;
  const day = relativeDay(c.openedAt, now, timeZone);
  const barberNames = [...new Set(c.items.map((i) => lookups.employeeName(i.barberId)))];
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    clientId: c.clientId,
    clientName: lookups.clientName(c.clientId),
    openedAtLabel: day === "Hoje" ? clockTime(c.openedAt, timeZone) : `${day} ${clockTime(c.openedAt, timeZone)}`,
    items: c.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      name: i.name,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.unitPrice * i.quantity,
      barberId: i.barberId,
      barberName: lookups.employeeName(i.barberId),
      soldWithoutStock: i.soldWithoutStock !== null,
    })),
    subtotal: comandaSubtotal(c),
    discount: c.discount?.amount ?? 0,
    total: c.payment?.total ?? comandaTotal(c),
    paymentMethod: c.payment?.method ?? null,
    paymentChange: c.payment?.change ?? null,
    note: c.note,
    appointment: c.appointment
      ? {
          label: `${relativeDay(c.appointment.at, now, timeZone)} ${clockTime(c.appointment.at, timeZone)}`,
          time: clockTime(c.appointment.at, timeZone),
          barberId: c.appointment.barberId,
          barberName: lookups.employeeName(c.appointment.barberId),
          timePassed: c.appointment.at.getTime() <= now.getTime(),
        }
      : null,
    pending: c.status === "open" && c.pendingSince ? { daysLeft: pendingDaysLeft(c, now, lookups.expiryDays) } : null,
    cancellationReason: c.cancellation?.reason ?? null,
    barbersLabel: barberNames.length > 0 ? barberNames.join(", ") : "Sem itens",
  };
}

/** "vence hoje" / "vence em 3 dias". */
export function expiryText(daysLeft: number): string {
  return daysLeft === 0 ? "vence hoje" : `vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`;
}

export function clientDisplayName(client: { name: string; anonymizedAt: Date | null } | undefined): string {
  if (!client) return ANONYMIZED_NAME;
  return client.anonymizedAt ? ANONYMIZED_NAME : client.name;
}
