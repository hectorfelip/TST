import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { DAY_MS } from "@/shared/time";
import { appointment, expectError, HOUR, intruder, newComanda, NOW, openCash, owner, rafael, diego, withService } from "@/test/fixtures";
import { closeComanda, markNoShow, type Comanda } from "./comanda";
import { closeDay, expirePendingComandas, pendingDaysLeft, planDayClose, type DayDecision } from "./day-close";

const EVENING = new Date(NOW.getTime() + 8 * HOUR);
const EXPIRY = 5;

/** The day of the example the owner gave: an appointment at 15h that nobody attended. */
function scene() {
  const { register, movements } = openCash(10000);
  const walkInUnpaid = withService(newComanda(rafael, 1), rafael); // service done, never paid
  const emptyWalkIn = newComanda(rafael, 2);
  const noShowWithItems = withService(appointment(rafael, 3, 1, rafael, "c3"), rafael); // marked by the barber
  const markedNoShow = unwrap(markNoShow(rafael, noShowWithItems, new Date(NOW.getTime() + 2 * HOUR))).comanda;
  const apptUnpaid = withService(appointment(owner, 4, 3, diego, "c4"), owner, undefined, diego); // 15h, no one came
  const apptEmpty = appointment(owner, 5, 4, diego, "c5");
  const tomorrow = appointment(owner, 6, 20, diego, "c6"); // later: not part of today's closing
  const all: Comanda[] = [walkInUnpaid, emptyWalkIn, markedNoShow, apptUnpaid, apptEmpty, tomorrow];
  return { register, movements, all, walkInUnpaid, emptyWalkIn, markedNoShow, apptUnpaid, apptEmpty, tomorrow };
}

const base = (s: ReturnType<typeof scene>, extra: Partial<Parameters<typeof closeDay>[1]> = {}) => ({
  register: s.register,
  movements: s.movements,
  comandas: s.all,
  countedCash: 10000,
  reason: null,
  decisions: {} as Record<string, DayDecision>,
  confirmed: true,
  expiryDays: EXPIRY,
  at: EVENING,
  ...extra,
});

const decideAll = (s: ReturnType<typeof scene>): Record<string, DayDecision> => ({
  [s.walkInUnpaid.id]: "keep_pending",
  [s.emptyWalkIn.id]: "discard",
  [s.markedNoShow.id]: "reviewed",
  [s.apptUnpaid.id]: "no_show",
  [s.apptEmpty.id]: "no_show",
});

describe("planDayClose — the alert shown to the owner (R-CSH-08)", () => {
  it("lists every unpaid service with value and the allowed options; future appointments are left out", () => {
    const s = scene();
    const { entries, atRiskTotal } = unwrap(planDayClose(owner, { register: s.register, comandas: s.all, expiryDays: EXPIRY, at: EVENING }));
    expect(entries.map((e) => [e.comanda.number, e.kind, e.options])).toEqual([
      [1, "unpaid", ["keep_pending"]],
      [2, "empty", ["discard"]],
      [3, "no_show_with_items", ["reviewed"]],
      [4, "unpaid", ["no_show", "keep_pending"]],
      [5, "empty", ["no_show"]],
    ]);
    expect(atRiskTotal).toBe(4500 * 3);
    expect(entries.find((e) => e.comanda.id === s.tomorrow.id)).toBeUndefined();
  });

  it("only the owner sees the plan; needs an open register; other shops are ignored", () => {
    const s = scene();
    expectError(planDayClose(rafael, { register: s.register, comandas: s.all, expiryDays: EXPIRY, at: EVENING }), "FORBIDDEN");
    expectError(planDayClose(owner, { register: null, comandas: s.all, expiryDays: EXPIRY, at: EVENING }), "INVALID_STATE");
    const foreign = { ...newComanda(rafael, 9), barbershopId: intruder.barbershopId };
    const plan = unwrap(planDayClose(owner, { register: s.register, comandas: [foreign], expiryDays: EXPIRY, at: EVENING }));
    expect(plan.entries).toEqual([]);
  });

  it("a no-show marked BEFORE this register opened is not shown again", () => {
    const s = scene();
    const older = { ...s.markedNoShow, noShow: { by: "rafael", at: new Date(s.register.openedAt.getTime() - HOUR) } };
    const plan = unwrap(planDayClose(owner, { register: s.register, comandas: [older], expiryDays: EXPIRY, at: EVENING }));
    expect(plan.entries).toEqual([]);
  });

  it("shows how many days a pending comanda still has", () => {
    const s = scene();
    const pending = { ...s.walkInUnpaid, pendingSince: new Date(EVENING.getTime() - 3 * DAY_MS) };
    const plan = unwrap(planDayClose(owner, { register: s.register, comandas: [pending], expiryDays: EXPIRY, at: EVENING }));
    expect(plan.entries[0].expiresInDays).toBe(2);
  });
});

describe("closeDay (R-CSH-05/06, R-CMD-18)", () => {
  it("settles every comanda, never blocks, and returns what happened", () => {
    const s = scene();
    const result = unwrap(closeDay(owner, base(s, { decisions: decideAll(s) })));
    expect(result.register.status).toBe("closed");
    expect(result.discarded.map((c) => [c.number, c.status])).toEqual([[2, "discarded"]]);
    expect(result.noShows.map((c) => [c.number, c.status])).toEqual([[4, "no_show"], [5, "no_show"]]);
    expect(result.noShows.every((c) => c.cancellation === null)).toBe(true); // never "cancelled"
    expect(result.pending.map((c) => [c.number, c.status, c.pendingSince])).toEqual([[1, "open", EVENING]]);
    expect(result.reviewed.map((c) => c.number)).toEqual([3]);
    expect(result.audits.map((a) => a.action)).toEqual(["cash.closed_with_pending", "comanda.no_show", "comanda.no_show"]);
    expect(result.audits[0].details).toEqual({ count: 1, total: 4500 });
  });

  it("verification first: every unpaid comanda needs a decision, none is settled silently", () => {
    const s = scene();
    const decisions = decideAll(s);
    delete decisions[s.apptUnpaid.id];
    expectError(closeDay(owner, base(s, { decisions })), "NEEDS_CONFIRMATION");
    expectError(closeDay(owner, base(s, { decisions: {} })), "NEEDS_CONFIRMATION");
  });

  it("each option is checked: an option that does not exist for that comanda is refused", () => {
    const s = scene();
    expectError(closeDay(owner, base(s, { decisions: { ...decideAll(s), [s.walkInUnpaid.id]: "no_show" } })), "INVALID_INPUT"); // walk-in has no appointment
    expectError(closeDay(owner, base(s, { decisions: { ...decideAll(s), [s.emptyWalkIn.id]: "keep_pending" } })), "INVALID_INPUT");
    expectError(closeDay(owner, base(s, { decisions: { ...decideAll(s), [s.apptUnpaid.id]: "discard" } })), "INVALID_INPUT"); // would erase a service
    expectError(closeDay(owner, base(s, { decisions: { ...decideAll(s), nope: "discard" } })), "INVALID_INPUT");
  });

  it("confirmation step: without `confirmed` nothing happens", () => {
    const s = scene();
    expectError(closeDay(owner, base(s, { decisions: decideAll(s), confirmed: false })), "NEEDS_CONFIRMATION");
  });

  it("barber cannot close the day; a wrong count without a reason blocks everything", () => {
    const s = scene();
    expectError(closeDay(rafael, base(s, { decisions: decideAll(s) })), "FORBIDDEN");
    expectError(closeDay(owner, base(s, { decisions: decideAll(s), countedCash: 9000 })), "INVALID_INPUT");
    const withReason = unwrap(closeDay(owner, base(s, { decisions: decideAll(s), countedCash: 9000, reason: "Troco errado" })));
    expect(withReason.register.difference).toBe(-1000);
  });

  it("works with nothing open", () => {
    const { register, movements } = openCash(10000);
    const result = unwrap(closeDay(owner, { register, movements, comandas: [], countedCash: 10000, reason: null, decisions: {}, confirmed: true, expiryDays: EXPIRY, at: EVENING }));
    expect(result.audits).toEqual([]);
  });

  it("keeping the same comanda pending again does not restart its countdown", () => {
    const s = scene();
    const since = new Date(EVENING.getTime() - 2 * DAY_MS);
    const pending = { ...s.walkInUnpaid, pendingSince: since };
    const result = unwrap(closeDay(owner, { ...base(s), comandas: [pending], decisions: { [pending.id]: "keep_pending" } }));
    expect(result.pending[0].pendingSince).toEqual(since);
  });

  it("the money of a pending comanda paid the next day goes to the NEW register", () => {
    const s = scene();
    const day1 = unwrap(closeDay(owner, base(s, { decisions: decideAll(s) })));
    const day2 = { ...openCash(10000).register, openedAt: new Date(EVENING.getTime() + 12 * HOUR) };
    const paid = unwrap(closeComanda(rafael, day1.pending[0], { method: "cash", receivedCash: null, at: day2.openedAt }, day2));
    expect(paid.cashMovements[0].registerId).toBe(day2.id);
  });
});

describe("pending expires after N days (R-CMD-22)", () => {
  const pendingFor = (days: number) => ({ ...withService(newComanda(rafael, 1), rafael), pendingSince: new Date(NOW.getTime() - days * DAY_MS) });

  it("counts the days left", () => {
    expect(pendingDaysLeft(pendingFor(0), NOW, 5)).toBe(5);
    expect(pendingDaysLeft(pendingFor(3), NOW, 5)).toBe(2);
    expect(pendingDaysLeft(pendingFor(5), NOW, 5)).toBe(0);
    expect(pendingDaysLeft(pendingFor(9), NOW, 5)).toBe(0);
    expect(pendingDaysLeft(withService(newComanda(), rafael), NOW, 5)).toBeNull();
  });

  it("after 5 days the system cancels it, with a reason, by 'system', audited", () => {
    const { comandas, audits } = expirePendingComandas([pendingFor(5)], NOW, 5);
    expect(comandas[0]).toMatchObject({ status: "cancelled", pendingSince: null, cancellation: { by: "system" } });
    expect(comandas[0].cancellation?.reason).toContain("5 dias");
    expect(audits).toEqual([expect.objectContaining({ action: "comanda.expired", userId: "system", details: expect.objectContaining({ total: 4500 }) })]);
  });

  it("not before 5 days, and never touches paid, no-show or comandas that are not pending", () => {
    expect(expirePendingComandas([pendingFor(4.9)], NOW, 5).comandas).toEqual([]);
    expect(expirePendingComandas([withService(newComanda(), rafael)], NOW, 5).comandas).toEqual([]);
    const { register } = openCash();
    const paid = unwrap(closeComanda(rafael, pendingFor(10), { method: "pix", receivedCash: null, at: NOW }, register)).comanda;
    expect(expirePendingComandas([paid], NOW, 5).comandas).toEqual([]);
    expect(expirePendingComandas([{ ...pendingFor(10), status: "no_show" }], NOW, 5).comandas).toEqual([]);
  });

  it("the number of days is custom: 1 day expires a 1-day-old comanda; 30 days waits 29", () => {
    expect(expirePendingComandas([pendingFor(1)], NOW, 1).comandas).toHaveLength(1);
    expect(expirePendingComandas([pendingFor(29)], NOW, 30).comandas).toEqual([]);
    expect(expirePendingComandas([pendingFor(30)], NOW, 30).comandas).toHaveLength(1);
    expect(expirePendingComandas([pendingFor(9)], NOW, 10).comandas).toEqual([]);
    expect(pendingDaysLeft(pendingFor(2), NOW, 10)).toBe(8);
  });

  it("OPTION OFF (null): nothing ever expires, no countdown, the owner is still alerted", () => {
    const old = pendingFor(400);
    expect(expirePendingComandas([old], NOW, null)).toEqual({ comandas: [], audits: [] });
    expect(pendingDaysLeft(old, NOW, null)).toBeNull();
    const s = scene();
    const pending = { ...s.walkInUnpaid, pendingSince: new Date(EVENING.getTime() - 100 * DAY_MS) };
    const plan = unwrap(planDayClose(owner, { register: s.register, comandas: [pending], expiryDays: null, at: EVENING }));
    expect(plan.entries[0]).toMatchObject({ kind: "unpaid", expiresInDays: null, options: ["keep_pending"] });
    expect(plan.atRiskTotal).toBe(4500); // still shown as money at risk
  });

  it("OPTION OFF: closing the day still accepts 'keep pending' and starts no countdown", () => {
    const s = scene();
    const result = unwrap(closeDay(owner, { ...base(s, { decisions: decideAll(s) }), expiryDays: null }));
    expect(result.pending.map((c) => c.number)).toEqual([1]);
    expect(result.audits.map((a) => a.action)).toContain("cash.closed_with_pending");
  });

  it("PREVIEW before changing the setting: lowering the deadline would cancel the old ones now", () => {
    const pending = [pendingFor(3), pendingFor(1)];
    expect(expirePendingComandas(pending, NOW, 5).comandas).toHaveLength(0);
    expect(expirePendingComandas(pending, NOW, 3).comandas).toHaveLength(1);
    expect(expirePendingComandas(pending, NOW, 1).comandas).toHaveLength(2);
  });
});
