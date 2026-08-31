/**
 * Pure coupon-validation logic (HUR-190, U10 / PRD R10).
 *
 * Scope note: `evaluateCoupon()` below is **validation only** and stays pure
 * (no DB access, no `Coupon.usedCount` writes) — see
 * src/lib/api/coupons.ts / src/app/api/coupons/validate/route.ts for the
 * read-only DB wrapper and route that use it.
 *
 * `redeemCoupon()` (HUR-191, U11 / HUB-38 checkout) is the atomic redemption
 * counterpart: a guarded UPDATE run inside checkout's own `db.$transaction`,
 * re-checking every validity condition (active/cap/expiry) at the moment of
 * redemption so a race between two concurrent checkouts against the last
 * remaining use of a capped coupon can never both succeed.
 *
 * Only the existing `Coupon` model's actual columns are used (code, type,
 * value, minOrderUsd, maxUses, usedCount, expiresAt, isActive) — no
 * product/category/brand scoping (that richer §6.2 promotion scope is not
 * authorized for this ticket).
 */

import type { Prisma } from "@prisma/client";

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

/**
 * Thrown by `redeemCoupon()` when the guarded UPDATE affects 0 rows — the
 * coupon was deactivated, hit its usage cap, or expired between the
 * pre-checkout validation read and this redemption write (a genuine race,
 * not a generic failure). Callers (checkout) must catch this specifically
 * to surface a distinguishable `coupon_no_longer_valid` error rather than a
 * generic 500.
 */
export class CouponRedemptionRaceError extends Error {
  constructor(couponId: string) {
    super(`redeemCoupon: coupon ${couponId} is no longer valid (race on redemption)`);
    this.name = "CouponRedemptionRaceError";
  }
}

/**
 * Atomically increment `Coupon.usedCount` by 1, re-checking every validity
 * condition inside the same guarded SQL UPDATE (not just a prior read) —
 * mirrors `adjustStock()`'s conditional-UPDATE pattern in
 * src/lib/inventory.ts, applied here to the coupon usage cap instead of
 * stock. Must be called inside the caller's own transaction (`tx`) so this
 * redemption commits or rolls back atomically with the rest of order
 * creation. Throws `CouponRedemptionRaceError` (0 rows affected) instead of
 * silently no-op'ing.
 */
export async function redeemCoupon(tx: Prisma.TransactionClient, couponId: string): Promise<void> {
  const affected = await tx.$executeRaw`
    UPDATE coupons
    SET used_count = used_count + 1
    WHERE id = ${couponId} AND is_active = true
      AND (max_uses IS NULL OR used_count < max_uses)
      AND (expires_at IS NULL OR expires_at > now())
  `;

  if (affected === 0) {
    throw new CouponRedemptionRaceError(couponId);
  }
}
