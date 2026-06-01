import { describe, it, expect } from "vitest";
import { calculateBookRentalPrice, getBookOriginalPrice, calculateCabinetFee } from "../pricing";

describe("calculateBookRentalPrice", () => {
  it("returns a positive number for valid inputs", () => {
    const price = calculateBookRentalPrice(50, 30);
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThanOrEqual(50);
  });

  it("charges more for longer rental periods", () => {
    const d30 = calculateBookRentalPrice(100, 30);
    const d90 = calculateBookRentalPrice(100, 90);
    const d365 = calculateBookRentalPrice(100, 365);
    expect(d90).toBeGreaterThan(d30);
    expect(d365).toBeGreaterThan(d90);
  });

  it("never exceeds original price", () => {
    const price = calculateBookRentalPrice(20, 365);
    expect(price).toBeLessThanOrEqual(20);
  });
});

describe("getBookOriginalPrice", () => {
  it("returns a positive number", () => {
    expect(getBookOriginalPrice("高等数学")).toBeGreaterThan(0);
  });

  it("returns a default for unknown titles", () => {
    expect(getBookOriginalPrice("未知书籍xyz")).toBeGreaterThan(0);
  });
});

describe("calculateCabinetFee", () => {
  it("returns a non-negative number", () => {
    const fee = calculateCabinetFee(60, 60, false);
    expect(fee).toBeGreaterThanOrEqual(0);
  });

  it("charges less for marketplace special", () => {
    const normal = calculateCabinetFee(120, 120, false);
    const market = calculateCabinetFee(120, 120, true);
    expect(market).toBeLessThanOrEqual(normal);
  });
});
