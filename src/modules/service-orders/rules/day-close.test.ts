import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { expectError, intruder, newComanda, NOW, openCash, owner, rafael, withService } from "@/test/fixtures";
import { closeComanda } from "./comanda";
import { cancelPendingComandas, closeDay, isPendingFromBefore } from "./day-close";

const LATER = new Date(NOW.getTime() + 8 * 60 * 60 * 1000);

describe("closeDay (R-CSH-05/06)", () => {
  it("closes with open comandas: empty ones discarded, ones with items stay pending and are audited", () => {
    const { register, movements } = openCash(10000);
    const empty = newComanda(rafael, 1);
    const noShow = withService(newComanda(rafael, 2), rafael); // opened for the 15h client who never came
    const result = unwrap(closeDay(owner, { register, movements, openComandas: [empty, noShow], countedCash: 10000, reason: null, at: LATER }));
    expect(result.register.status).toBe("closed");
    expect(result.discarded.map((c) => [c.number, c.status])).toEqual([[1, "discarded"]]);
    expect(result.pending.map((c) => [c.number, c.status])).toEqual([[2, "open"]]);
    expect(result.audits).toEqual([expect.objectContaining({ action: "cash.closed_with_pending", details: { count: 1, total: 4500 } })]);
  });

  it("nothing is discarded when closing fails (barber, wrong count without reason)", () => {
    const { register, movements } = openCash(10000);
    const input = { register, movements, openComandas: [newComanda(rafael)], countedCash: 9000, reason: null, at: LATER };
    expectError(closeDay(rafael, input), "FORBIDDEN");
    expectError(closeDay(owner, input), "INVALID_INPUT");
  });

  it("ignores comandas of other barbershops and comandas already closed", () => {
    const { register, movements } = openCash(10000);
    const paid = unwrap(closeComanda(rafael, withService(newComanda(rafael), rafael), { method: "pix", receivedCash: null, at: NOW }, register)).comanda;
    const foreign = { ...newComanda(rafael), barbershopId: intruder.barbershopId };
    const result = unwrap(closeDay(owner, { register, movements, openComandas: [paid, foreign], countedCash: 10000, reason: null, at: LATER }));
    expect(result.discarded).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it("a pending comanda can be paid the next day; the money goes to the new register", () => {
    const day1 = openCash(10000);
    const pending = withService(newComanda(rafael, 7), rafael);
    unwrap(closeDay(owner, { register: day1.register, movements: day1.movements, openComandas: [pending], countedCash: 10000, reason: null, at: LATER }));
    const day2 = { ...openCash(10000).register, openedAt: new Date(LATER.getTime() + 12 * 3600 * 1000) };
    expect(isPendingFromBefore(pending, day2)).toBe(true);
    const paid = unwrap(closeComanda(rafael, pending, { method: "cash", receivedCash: null, at: day2.openedAt }, day2));
    expect(paid.cashMovements[0].registerId).toBe(day2.id);
  });
});

describe("cancelPendingComandas (R-CMD-18)", () => {
  it("owner cancels many no-shows with one reason; each one is audited; empty ones are discarded", () => {
    const list = [withService(newComanda(rafael, 1), rafael), withService(newComanda(rafael, 2), rafael), newComanda(rafael, 3)];
    const { comandas, audits } = unwrap(cancelPendingComandas(owner, list, { reason: "Cliente não compareceu", at: NOW }));
    expect(comandas.map((c) => c.status)).toEqual(["cancelled", "cancelled", "discarded"]);
    expect(comandas[0].cancellation?.reason).toBe("Cliente não compareceu");
    expect(audits).toHaveLength(2);
  });

  it("barber cannot bulk cancel; reason required; all or nothing", () => {
    const open = withService(newComanda(rafael, 1), rafael);
    expectError(cancelPendingComandas(rafael, [open], { reason: "Cliente não compareceu", at: NOW }), "FORBIDDEN");
    expectError(cancelPendingComandas(owner, [open], { reason: "", at: NOW }), "INVALID_INPUT");
    expectError(cancelPendingComandas(owner, [], { reason: "Cliente não compareceu", at: NOW }), "INVALID_INPUT");
    const { register } = openCash();
    const paid = unwrap(closeComanda(rafael, withService(newComanda(rafael, 2), rafael), { method: "pix", receivedCash: null, at: NOW }, register)).comanda;
    expectError(cancelPendingComandas(owner, [open, paid], { reason: "Cliente não compareceu", at: NOW }), "INVALID_STATE");
  });
});
