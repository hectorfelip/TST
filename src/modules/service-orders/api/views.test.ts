import { describe, expect, it } from "vitest";
import type { Comanda } from "../rules/comanda";
import { expiryText, toComandaView, type Lookups } from "./views";

const NOW = new Date("2026-10-02T15:00:00Z"); // 12:00 in São Paulo
const lookups: Lookups = {
  now: NOW,
  timeZone: "America/Sao_Paulo",
  expiryDays: 5,
  employeeName: (id) => ({ b1: "Rafael", b2: "Diego" })[id] ?? "—",
  clientName: (id) => (id === null ? "Cliente avulso" : id === "c1" ? "André Souza" : "Cliente removido"),
};

function comanda(over: Partial<Comanda> = {}): Comanda {
  return {
    id: "k1", barbershopId: "s1", number: 1027, clientId: "c1", openedBy: "b1", openedAt: new Date("2026-10-02T13:32:00Z"), status: "open",
    items: [
      { id: "i1", kind: "service", refId: "x", name: "Corte + Barba", unitPrice: 7000, quantity: 1, barberId: "b1", addedBy: "b1", addedAt: NOW, soldWithoutStock: null },
      { id: "i2", kind: "product", refId: "y", name: "Pomada", unitPrice: 4500, quantity: 2, barberId: "b2", addedBy: "b1", addedAt: NOW, soldWithoutStock: { confirmedBy: "b1", at: NOW } },
    ],
    removedItems: [], discount: null, payment: null, note: null, appointment: null, pendingSince: null, noShow: null, closedAt: null, closedBy: null, cancellation: null,
    ...over,
  };
}

describe("toComandaView", () => {
  it("turns a comanda into words and cents", () => {
    const v = toComandaView(comanda(), lookups);
    expect(v).toMatchObject({
      number: 1027, clientName: "André Souza", openedAtLabel: "10:32", subtotal: 16000, discount: 0, total: 16000, barbersLabel: "Rafael, Diego",
      paymentMethod: null, pending: null, appointment: null,
    });
    expect(v.items[1]).toMatchObject({ name: "Pomada", quantity: 2, lineTotal: 9000, barberName: "Diego", soldWithoutStock: true });
  });

  it("a walk-in comanda with no items", () => {
    const v = toComandaView(comanda({ clientId: null, items: [] }), lookups);
    expect(v).toMatchObject({ clientName: "Cliente avulso", total: 0, barbersLabel: "Sem itens" });
  });

  it("an older comanda says which day it was opened", () => {
    expect(toComandaView(comanda({ openedAt: new Date("2026-10-01T21:10:00Z") }), lookups).openedAtLabel).toBe("Ontem 18:10");
  });

  it("an appointment: label, time and whether the time already passed", () => {
    const later = toComandaView(comanda({ appointment: { at: new Date("2026-10-02T18:00:00Z"), barberId: "b2" } }), lookups).appointment;
    expect(later).toEqual({ label: "Hoje 15:00", time: "15:00", barberId: "b2", barberName: "Diego", timePassed: false });
    const passed = toComandaView(comanda({ appointment: { at: new Date("2026-10-02T14:00:00Z"), barberId: "b2" } }), lookups).appointment;
    expect(passed?.timePassed).toBe(true);
    const tomorrow = toComandaView(comanda({ appointment: { at: new Date("2026-10-03T13:00:00Z"), barberId: "b1" } }), lookups).appointment;
    expect(tomorrow?.label).toBe("Amanhã 10:00");
  });

  it("pending: days left, and no deadline when the barbershop turned the option off", () => {
    const pendingSince = new Date("2026-09-29T15:00:00Z"); // 3 days ago, deadline 5
    expect(toComandaView(comanda({ pendingSince }), lookups).pending).toEqual({ daysLeft: 2 });
    expect(toComandaView(comanda({ pendingSince }), { ...lookups, expiryDays: null }).pending).toEqual({ daysLeft: null });
  });

  it("a paid comanda shows what was really charged (after the discount), the method and the change", () => {
    const v = toComandaView(
      comanda({
        status: "closed",
        discount: { amount: 1000, givenBy: "o1", at: NOW },
        payment: { method: "cash", total: 15000, receivedCash: 20000, change: 5000, registerId: "r1" },
      }),
      lookups,
    );
    expect(v).toMatchObject({ subtotal: 16000, discount: 1000, total: 15000, paymentMethod: "cash", paymentChange: 5000 });
  });

  it("a cancelled comanda carries the reason", () => {
    expect(toComandaView(comanda({ status: "cancelled", cancellation: { reason: "Cobrado em duplicidade", by: "o1", at: NOW } }), lookups).cancellationReason).toBe("Cobrado em duplicidade");
  });
});

describe("expiryText", () => {
  it("says when", () => {
    expect(expiryText(0)).toBe("vence hoje");
    expect(expiryText(1)).toBe("vence em 1 dia");
    expect(expiryText(4)).toBe("vence em 4 dias");
  });
});
