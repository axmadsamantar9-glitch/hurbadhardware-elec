/**
 * Pure coupon-validation logic (HUR-190, U10 / PRD R10).
 *
 * Scope note: this module is **validation only**. It never touches
 * `Coupon.usedCount` — atomic redemption (the guarded increment at order
 * placement) is explicitly deferred to HUB-38 (checkout). See
 * src/lib/api/coupons.ts / src/app/api/coupons/validate/route.ts for the
 * read-only DB wrapper and route that use this.
 *
 * Only the existing `Coupon` model's actual columns are used (code, type,
 * value, minOrderUsd, maxUses, usedCount, expiresAt, isActive) — no
 * product/category/brand scoping (that richer §6.2 promotion scope is not
 * authorized for this ticket).
 */

export type CouponType = "PERCENT" | "FIXED";

/** Structural subset of the `Coupon` Prisma model needed to evaluate it — plain numbers, not `Decimal`. */
export interface CouponRecordLike {
  type: CouponType;
  /** Percent (0-100) for PERCENT coupons, or a flat USD amount for FIXED coupons. */
  value: number;
  minOrderUsd: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export type CouponInvalidReason =
  "not_found" | "inactive" | "expired" | "usage_cap_reached" | "minimum_order_not_met";

export type CouponValidationResult =
  | { valid: true; type: CouponType; value: number; discountUsd: number }
  | { valid: false; reason: CouponInvalidReason };

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Evaluate a coupon against a subtotal. Checks run in this order: existence
 * -> active -> expiry -> usage cap -> minimum order — matching the ticket's
 * enumerated scenario list (HUR-190 scope item 8).
 *
 * Discount calc (scope item 9):
 *   - PERCENT: `subtotalUsd * value/100`
 *   - FIXED:   `min(value, subtotalUsd)` — never implies a negative total.
 */
export function evaluateCoupon(
  coupon: CouponRecordLike | null,
  subtotalUsd: number,
  now: Date = new Date()
): CouponValidationResult {
  if (!coupon) return { valid: false, reason: "not_found" };
  if (!coupon.isActive) return { valid: false, reason: "inactive" };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
    return { valid: false, reason: "expired" };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, reason: "usage_cap_reached" };
  }
  if (coupon.minOrderUsd !== null && subtotalUsd < coupon.minOrderUsd) {
    return { valid: false, reason: "minimum_order_not_met" };
  }

  const discountUsd =
    coupon.type === "PERCENT"
      ? roundMoney(subtotalUsd * (coupon.value / 100))
      : roundMoney(Math.min(coupon.value, subtotalUsd));

  return { valid: true, type: coupon.type, value: coupon.value, discountUsd };
}
