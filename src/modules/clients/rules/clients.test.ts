import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/modules/barbershops/rules/settings";
import { unwrap } from "@/shared/result";
import { expectError, intruder, NOW, owner, rafael } from "@/test/fixtures";
import {
  ANONYMIZED_NAME,
  anonymizeClient,
  clientViewFor,
  createClient,
  formatPhone,
  isAway,
  matchesSearch,
  normalizePhone,
  updateClient,
  type ClientVisit,
} from "./clients";

const marcos = unwrap(createClient(rafael, { id: "c2", name: "  Marcos   Lima ", phone: "(11) 97777-2222", notes: "", at: NOW }, null));
const visits: ClientVisit[] = [
  { comandaId: "k1", at: new Date("2026-08-01"), barberId: "carlos", description: "Corte", amount: 4500 },
  { comandaId: "k2", at: new Date("2026-09-15"), barberId: "rafael", description: "Barba", amount: 3500 },
];

describe("phone", () => {
  it.each([
    ["(11) 98888-1111", "11988881111"],
    ["+55 11 98888-1111", "11988881111"],
    ["11 3333-4444", "1133334444"],
    ["", null],
  ])("normalizes %s", (raw, expected) => {
    expect(unwrap(normalizePhone(raw))).toBe(expected);
  });

  it.each(["12345", "11 88888-1111", "00 98888-1111", "11 1333-4444"])("rejects %s", (raw) => {
    expectError(normalizePhone(raw), "INVALID_INPUT");
  });
});

describe("create / update (R-CLI-01..03)", () => {
  it("barber can register; name is cleaned; phone stored as digits", () => {
    expect(marcos).toMatchObject({ name: "Marcos Lima", phone: "11977772222", notes: null, anonymizedAt: null });
  });

  it("phone is unique per barbershop", () => {
    expectError(createClient(rafael, { id: "c9", name: "Outro", phone: "11977772222", notes: "", at: NOW }, marcos), "NOT_ALLOWED");
    expect(createClient(rafael, { id: "c9", name: "Outro", phone: "", notes: "", at: NOW }, marcos).ok).toBe(true);
  });

  it("only the owner edits", () => {
    expectError(updateClient(rafael, marcos, { name: "M", phone: "", notes: "" }, null), "FORBIDDEN");
    expect(unwrap(updateClient(owner, marcos, { name: "Marcos L.", phone: "11977772222", notes: "VIP" }, marcos)).notes).toBe("VIP");
    expectError(updateClient(intruder, marcos, { name: "Marcos", phone: "", notes: "" }, null), "WRONG_TENANT");
  });
});

describe("LGPD (R-CLI-04)", () => {
  it("owner erases personal data; audited; cannot repeat; cannot edit after", () => {
    expectError(anonymizeClient(rafael, marcos, NOW), "FORBIDDEN");
    const { client, audit } = unwrap(anonymizeClient(owner, marcos, NOW));
    expect(client).toMatchObject({ name: ANONYMIZED_NAME, phone: null, notes: null, anonymizedAt: NOW });
    expect(audit.action).toBe("client.anonymized");
    expectError(anonymizeClient(owner, client, NOW), "INVALID_STATE");
    expectError(updateClient(owner, client, { name: "Marcos", phone: "", notes: "" }, null), "INVALID_STATE");
    expect(matchesSearch(client, "")).toBe(false);
  });
});

describe("what each role sees (R-CLI-05, decision B)", () => {
  it("owner sees phone and every visit", () => {
    const view = unwrap(clientViewFor(owner, marcos, visits, 2));
    expect(view.phone).toBe("11977772222");
    expect(view.noShowCount).toBe(2);
    expect(view.visits.map((v) => v.comandaId)).toEqual(["k2", "k1"]);
  });

  it("barber sees no phone and only his own visits, but the real last visit date", () => {
    const view = unwrap(clientViewFor(rafael, marcos, visits, 2));
    expect(view.phone).toBeNull();
    expect(view.noShowCount).toBe(2);
    expect(view.visits.map((v) => v.barberId)).toEqual(["rafael"]);
    expect(view.lastVisitAt).toEqual(new Date("2026-09-15"));
  });

  it("another barbershop sees nothing", () => {
    expectError(clientViewFor(intruder, marcos, visits, 0), "WRONG_TENANT");
  });

  it("search by name or phone digits (min 4)", () => {
    expect(matchesSearch(marcos, "marc")).toBe(true);
    expect(matchesSearch(marcos, "97777")).toBe(true);
    expect(matchesSearch(marcos, "11")).toBe(false);
    expect(matchesSearch(marcos, "pedro")).toBe(false);
  });
});

describe("away clients (R-CLI-06)", () => {
  it("away after more than N days; new clients are not away", () => {
    expect(isAway(new Date("2026-09-01T12:00:00-03:00"), NOW, DEFAULT_SETTINGS)).toBe(true); // 31 days
    expect(isAway(new Date("2026-09-02T12:00:00-03:00"), NOW, DEFAULT_SETTINGS)).toBe(false); // 30 days
    expect(isAway(null, NOW, DEFAULT_SETTINGS)).toBe(false);
    expect(isAway(new Date("2026-09-20"), NOW, { awayAfterDays: 7 })).toBe(true);
  });
});

describe("formatPhone", () => {
  it("shows Brazilian numbers the way people write them", () => {
    expect(formatPhone("11988881111")).toBe("(11) 98888-1111");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
  it("nothing in, nothing out; unexpected text is left alone", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("")).toBe("");
    expect(formatPhone("123")).toBe("123");
  });
});
