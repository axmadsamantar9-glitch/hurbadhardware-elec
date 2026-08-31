/**
 * /api/checkout -- place an order from the current user's DB cart (HUR-191,
 * U11 / PRD R11, Iron Rules #1 and #3).
 *
 * POST -> place an order. Body: { addressId, couponCode? }. No price,
 *         subtotal, tax, or total field is ever accepted -- every money
 *         figure is recomputed server-side inside `placeOrder()`'s
 *         transaction (see src/lib/api/checkout.ts).
 *
 * Trust boundary (matches src/app/api/cart/route.ts / wishlist precedent):
 * `userId` is ALWAYS taken from `session.user.id` (server-side, via
 * `auth()`), never from the request body.
 *
 * Rate limiting uses the dedicated "checkout" category/threshold, namespaced
 * per user (`checkout:<userId>`) so it never shares a bucket with cart or
 * wishlist calls.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { placeOrder, type CheckoutErrorCode } from "@/lib/api/checkout";

const PlaceOrderSchema = z.object({
  addressId: z.string().min(1),
  couponCode: z.string().min(1).optional(),
});

const ERROR_STATUS: Record<CheckoutErrorCode, number> = {
  cart_empty: 400,
  address_not_found: 404,
  product_unavailable: 409,
  insufficient_stock: 409,
  coupon_invalid: 400,
  coupon_no_longer_valid: 409,
};

async function requireUser(): Promise<{ userId: string } | { errorResponse: NextResponse }> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      errorResponse: NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      ),
    };
  }

  const userId = session.user.id;
  const { threshold } = getRateLimitConfig("checkout");
  // Namespaced key (`checkout:<userId>`) -- never shares a bucket with
  // cart/wishlist rate-limit keys.
  const rateLimitResult = rateLimiter.check(`checkout:${userId}`, threshold);
  if (!rateLimitResult.allowed) {
    return {
      errorResponse: NextResponse.json(
        {
          error: {
            message: "Rate limit exceeded",
            code: "rate_limit_exceeded",
            retryAfter: rateLimitResult.retryAfter,
          },
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      ),
    };
  }

  return { userId };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = PlaceOrderSchema.safeParse(body);
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

    const result = await placeOrder(gate.userId, parseResult.data);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: {
            message: "Unable to place order",
            code: result.error,
            couponReason: result.couponReason,
          },
        },
        { status: ERROR_STATUS[result.error] }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        orderId: result.orderId,
        subtotalUsd: result.subtotalUsd,
        discountUsd: result.discountUsd,
        taxUsd: result.taxUsd,
        totalUsd: result.totalUsd,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error("Checkout failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to place order", code: "internal_error" } },
      { status: 500 }
    );
  }
}
