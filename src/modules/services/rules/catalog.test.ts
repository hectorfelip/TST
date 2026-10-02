import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/result";
import { corte, expectError, intruder, owner, rafael } from "@/test/fixtures";
import { createService, setServiceActive, updateService } from "./catalog";

describe("services (R-SRV-01..03)", () => {
  it("owner creates and edits; barber cannot", () => {
    expect(unwrap(createService(owner, "s", { name: " Corte ", price: 4500, durationMinutes: 30, favorite: true })).name).toBe("Corte");
    expectError(createService(rafael, "s", { name: "Corte", price: 4500, durationMinutes: 30, favorite: true }), "FORBIDDEN");
    expect(unwrap(updateService(owner, corte, { name: "Corte", price: 5000, durationMinutes: 30, favorite: true })).price).toBe(5000);
    expectError(updateService(intruder, corte, { name: "Corte", price: 5000, durationMinutes: 30, favorite: true }), "WRONG_TENANT");
  });

  it("validates name, price and duration", () => {
    const base = { name: "Corte", price: 4500, durationMinutes: 30, favorite: false };
    expectError(createService(owner, "s", { ...base, name: "C" }), "INVALID_INPUT");
    expectError(createService(owner, "s", { ...base, price: 0 }), "INVALID_INPUT");
    expectError(createService(owner, "s", { ...base, price: 45.5 }), "INVALID_INPUT");
    expectError(createService(owner, "s", { ...base, durationMinutes: 2 }), "INVALID_INPUT");
  });

  it("deactivating removes it from favorites", () => {
    expect(unwrap(setServiceActive(owner, corte, false))).toMatchObject({ active: false, favorite: false });
  });
});
