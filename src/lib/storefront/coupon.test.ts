import { describe, it, expect } from "vitest";
import { evaluateCoupon, type CouponRecordLike } from "./coupon";

const NOW = new Date("2026-08-31T00:00:00.000Z");

function baseCoupon(overrides: Partial<CouponRecordLike> = {}): CouponRecordLike {
  return {
    type: "PERCENT",
    value: 10,
    minOrderUsd: null,
    maxUses: null,
    usedCount: 0,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

describe("evaluateCoupon", () => {
  it("returns not_found for a null coupon", () => {
    expect(evaluateCoupon(null, 100, NOW)).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns inactive for a deactivated coupon", () => {
    const result = evaluateCoupon(baseCoupon({ isActive: false }), 100, NOW);
    expect(result).toEqual({ valid: false, reason: "inactive" });
  });

  it("returns expired for a coupon past its expiry date", () => {
    const result = evaluateCoupon(
      baseCoupon({ expiresAt: new Date("2026-01-01T00:00:00.000Z") }),
      100,
      NOW
    );
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("accepts a coupon expiring exactly now or later", () => {
    const result = evaluateCoupon(baseCoupon({ expiresAt: NOW }), 100, NOW);
    expect(result.valid).toBe(true);
  });

  it("returns usage_cap_reached when usedCount has reached maxUses", () => {
    const result = evaluateCoupon(baseCoupon({ maxUses: 5, usedCount: 5 }), 100, NOW);
    expect(result).toEqual({ valid: false, reason: "usage_cap_reached" });
  });

  it("allows a coupon below its usage cap", () => {
    const result = evaluateCoupon(baseCoupon({ maxUses: 5, usedCount: 4 }), 100, NOW);
    expect(result.valid).toBe(true);
  });

  it("returns minimum_order_not_met when subtotal is below minOrderUsd", () => {
    const result = evaluateCoupon(baseCoupon({ minOrderUsd: 50 }), 49.99, NOW);
    expect(result).toEqual({ valid: false, reason: "minimum_order_not_met" });
  });

  it("allows a coupon when subtotal exactly meets minOrderUsd", () => {
    const result = evaluateCoupon(baseCoupon({ minOrderUsd: 50 }), 50, NOW);
    expect(result.valid).toBe(true);
  });

  it("computes a PERCENT discount as subtotal * value/100", () => {
    const result = evaluateCoupon(baseCoupon({ type: "PERCENT", value: 20 }), 100, NOW);
    expect(result).toEqual({ valid: true, type: "PERCENT", value: 20, discountUsd: 20 });
  });

  it("computes a FIXED discount as min(value, subtotal)", () => {
    const result = evaluateCoupon(baseCoupon({ type: "FIXED", value: 15 }), 100, NOW);
    expect(result).toEqual({ valid: true, type: "FIXED", value: 15, discountUsd: 15 });
  });

  it("caps a FIXED discount at the subtotal so the total never goes negative", () => {
    const result = evaluateCoupon(baseCoupon({ type: "FIXED", value: 50 }), 10, NOW);
    expect(result).toEqual({ valid: true, type: "FIXED", value: 50, discountUsd: 10 });
  });

  it("checks existence before inactive/expired/etc (not_found short-circuits)", () => {
    expect(evaluateCoupon(null, 0, NOW)).toEqual({ valid: false, reason: "not_found" });
  });
});
