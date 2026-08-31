/**
 * Coupon validation data layer (HUR-190, U10 / PRD R10).
 *
 * Read-only by design: `validateCouponForSubtotal()` NEVER writes to
 * `Coupon.usedCount` -- atomic redemption is deferred to HUB-38 (checkout).
 * See src/lib/storefront/coupon.ts for the pure evaluation logic this wraps.
 */

import { db } from "@/lib/db";
import { evaluateCoupon, type CouponValidationResult } from "@/lib/storefront/coupon";

/**
 * Look up a coupon by its (case-sensitive) code and evaluate it against the
 * given subtotal. A single `db.coupon.findUnique` read -- no mutation of any
 * kind, so N calls in a row leave `usedCount` untouched (see
 * src/app/api/coupons/validate/route.test.ts for the test proving this).
 */
export async function validateCouponForSubtotal(
  code: string,
  subtotalUsd: number
): Promise<CouponValidationResult> {
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) return evaluateCoupon(null, subtotalUsd);

  return evaluateCoupon(
    {
      type: coupon.type,
      value: coupon.value.toNumber(),
      minOrderUsd: coupon.minOrderUsd ? coupon.minOrderUsd.toNumber() : null,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      expiresAt: coupon.expiresAt,
      isActive: coupon.isActive,
    },
    subtotalUsd
  );
}
