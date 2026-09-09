import { describe, it, expect } from "vitest";
import { calculateShipping } from "./shipping";

describe("calculateShipping", () => {
  it("returns exactly 0 for a typical subtotal", () => {
    expect(calculateShipping(100)).toBe(0);
  });

  it("returns exactly 0 for a zero subtotal", () => {
    expect(calculateShipping(0)).toBe(0);
  });

  it("returns exactly 0 regardless of subtotal magnitude (no hidden rate)", () => {
    expect(calculateShipping(1)).toBe(0);
    expect(calculateShipping(999999.99)).toBe(0);
  });

  it("returns exactly 0 for a negative subtotal (should never happen, but doesn't error)", () => {
    expect(calculateShipping(-1)).toBe(0);
  });
});
