import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { dayRange } from "@/shared/time";
import { appointment, diego, HOUR, intruder, newComanda, NOW, owner, rafael } from "@/test/fixtures";
import { markNoShow } from "./comanda";
import { agendaBetween, noShowCount } from "./appointments";

const TZ = "America/Sao_Paulo";
// NOW = 02/10 12:00 São Paulo. "Today" = until 03/10 00:00; "tomorrow" = 03/10.
const today = dayRange(NOW, TZ);
const tomorrow = dayRange(NOW, TZ, 1);

describe("agenda: who sees which clients (answer to the owner's question 1)", () => {
  const rafaelToday = appointment(rafael, 1, 3); // 15:00 today
  const rafaelEarly = appointment(owner, 2, 1, rafael, "c2"); // 13:00 today, booked by the owner
  const diegoToday = appointment(owner, 3, 2, diego, "c3"); // 14:00 today
  const rafaelTomorrow = appointment(rafael, 4, 20, rafael, "c4"); // 08:00 tomorrow
  const all = [rafaelToday, rafaelTomorrow, diegoToday, rafaelEarly, newComanda(rafael, 9)];

  it("a barber sees only his own clients for today, earliest first", () => {
    expect(agendaBetween(rafael, all, today).map((c) => c.number)).toEqual([2, 1]);
  });

  it("…and for tomorrow", () => {
    expect(agendaBetween(rafael, all, tomorrow).map((c) => c.number)).toEqual([4]);
    expect(agendaBetween(diego, all, tomorrow)).toEqual([]);
  });

  it("the owner sees everyone's", () => {
    expect(agendaBetween(owner, all, today).map((c) => c.number)).toEqual([2, 3, 1]);
  });

  it("another barbershop sees nothing", () => {
    expect(agendaBetween(intruder, all, today)).toEqual([]);
  });

  it("a no-show leaves the day's list (it is not 'open' any more)", () => {
    const late = new Date(rafaelEarly.appointment!.at.getTime() + HOUR);
    const noShow = unwrap(markNoShow(rafael, rafaelEarly, late)).comanda;
    expect(agendaBetween(rafael, [noShow, rafaelToday], today).map((c) => c.number)).toEqual([1]);
  });

  it("the range uses the barbershop time zone: 23:30 in São Paulo is still 'today'", () => {
    const lateNight = appointment(rafael, 5, 11.5, rafael, "c5"); // 23:30 São Paulo
    expect(agendaBetween(rafael, [lateNight], today)).toHaveLength(1);
    expect(agendaBetween(rafael, [lateNight], tomorrow)).toHaveLength(0);
  });
});

describe("no-show count per client", () => {
  it("counts only no-shows of that client", () => {
    const a = appointment(rafael, 1, 1, rafael, "c1");
    const b = appointment(rafael, 2, 1, rafael, "c1");
    const other = appointment(rafael, 3, 1, rafael, "c2");
    const late = new Date(NOW.getTime() + 2 * HOUR);
    const marked = [a, b, other].map((c) => unwrap(markNoShow(rafael, c, late)).comanda);
    expect(noShowCount(marked, "c1")).toBe(2);
    expect(noShowCount(marked, "c2")).toBe(1);
    expect(noShowCount([a], "c1")).toBe(0);
  });
});
