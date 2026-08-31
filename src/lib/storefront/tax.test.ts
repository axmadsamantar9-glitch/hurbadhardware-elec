import { describe, it, expect } from "vitest";
import { calculateTax } from "./tax";

describe("calculateTax", () => {
  it("returns exactly 0 for a typical subtotal", () => {
    expect(calculateTax(100)).toBe(0);
  });

  it("returns exactly 0 for a zero subtotal", () => {
    expect(calculateTax(0)).toBe(0);
  });

  it("returns exactly 0 regardless of subtotal magnitude (no hidden rate)", () => {
    expect(calculateTax(1)).toBe(0);
    expect(calculateTax(999999.99)).toBe(0);
  });
});
