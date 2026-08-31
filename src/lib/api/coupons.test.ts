import { describe, it, expect, beforeEach, vi } from "vitest";
import { validateCouponForSubtotal } from "./coupons";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: { coupon: { findUnique: vi.fn() } },
}));

function decimalLike(value: number) {
  return { toNumber: () => value };
}

describe("validateCouponForSubtotal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns not_found when no coupon matches the code", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue(null);

    const result = await validateCouponForSubtotal("MISSING", 100);

    expect(result).toEqual({ valid: false, reason: "not_found" });
    expect(db.coupon.findUnique).toHaveBeenCalledWith({ where: { code: "MISSING" } });
  });

  it("returns a valid PERCENT result for a well-formed coupon", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue({
      type: "PERCENT",
      value: decimalLike(10),
      minOrderUsd: null,
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
      isActive: true,
    } as never);

    const result = await validateCouponForSubtotal("SAVE10", 100);

    expect(result).toEqual({ valid: true, type: "PERCENT", value: 10, discountUsd: 10 });
  });

  it("NEVER mutates usedCount — this route is read-only (U10 scope)", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue({
      type: "FIXED",
      value: decimalLike(5),
      minOrderUsd: decimalLike(20),
      maxUses: 10,
      usedCount: 3,
      expiresAt: null,
      isActive: true,
    } as never);

    for (let i = 0; i < 5; i++) {
      await validateCouponForSubtotal("SAVE5", 50);
    }

    // Only ever a read; no update/updateMany call exists on the mocked
    // db.coupon at all, so this proves nothing in this module attempts one.
    expect(db.coupon.findUnique).toHaveBeenCalledTimes(5);
    expect((db.coupon as unknown as Record<string, unknown>).update).toBeUndefined();
  });

  it("returns minimum_order_not_met with Decimal minOrderUsd correctly converted", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue({
      type: "FIXED",
      value: decimalLike(5),
      minOrderUsd: decimalLike(20),
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
      isActive: true,
    } as never);

    const result = await validateCouponForSubtotal("SAVE5", 10);

    expect(result).toEqual({ valid: false, reason: "minimum_order_not_met" });
  });
});
