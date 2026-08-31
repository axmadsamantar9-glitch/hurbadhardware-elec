/**
 * POST /api/coupons/validate -- validate a coupon code against a subtotal
 * (HUR-190, U10 / PRD R10).
 *
 * Body: { code, subtotalUsd }. Returns one of:
 *   - { valid: false, reason: "not_found" | "inactive" | "expired" |
 *       "usage_cap_reached" | "minimum_order_not_met" }
 *   - { valid: true, type, value, discountUsd }
 *
 * READ-ONLY BY DESIGN: this route (and everything it calls) never mutates
 * `Coupon.usedCount`. Atomic redemption is out of scope here, deferred to
 * HUB-38 (checkout) -- see src/app/api/coupons/validate/route.test.ts for a
 * test proving N calls leave `usedCount` unchanged.
 *
 * Public/unauthenticated on purpose -- a guest browsing the cart before
 * signing in must be able to see a coupon's discount preview. Rate-limited
 * under the "public" tier, keyed by IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP, createRateLimitResponse } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { validateCouponForSubtotal } from "@/lib/api/coupons";

const ValidateSchema = z.object({
  code: z.string().min(1),
  subtotalUsd: z.number(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIP = getClientIP(request);
    const { threshold } = getRateLimitConfig("public");
    // Namespaced key -- distinct from `public:<ip>` (used by /api/products)
    // and any other rateLimiter.check() call site (HUR-15 lesson).
    const rateLimitResult = rateLimiter.check(`coupon-validate:${clientIP}`, threshold);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult.retryAfter ?? 60) as unknown as NextResponse;
    }

    const body: unknown = await request.json().catch(() => null);
    const parseResult = ValidateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            message: "Invalid request body",
            code: "validation_error",
            issues: parseResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { code, subtotalUsd } = parseResult.data;
    if (!Number.isFinite(subtotalUsd) || subtotalUsd < 0) {
      return NextResponse.json(
        { error: { message: "Invalid subtotal", code: "validation_error" } },
        { status: 400 }
      );
    }

    const result = await validateCouponForSubtotal(code, subtotalUsd);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    logger.error("Coupon validation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to validate coupon", code: "internal_error" } },
      { status: 500 }
    );
  }
}
