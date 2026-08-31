/**
 * POST /api/cart/price -- re-price a set of {productId, variantId, quantity}
 * lines against live product/variant data (HUR-190 scope item 3: "the guest
 * cart's client-side render must re-fetch current price/stock live -- never
 * trust a stored or client-submitted price").
 *
 * Public/unauthenticated on purpose -- the guest cart (src/store/cartStore.ts)
 * has no server-side session to scope to; this endpoint never reads or
 * writes any user-specific state, it only re-derives prices from the
 * productId/variantId/quantity the client already holds. Authenticated
 * users get the equivalent via GET /api/cart instead (DB-backed, so it
 * doesn't need a client-submitted line list).
 *
 * Rate-limited under the "public" tier (like /api/products), keyed by IP.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP, createRateLimitResponse } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { priceCartLines } from "@/lib/api/cart-pricing";

const PriceRequestSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).nullable().optional(),
        quantity: z.number(),
      })
    )
    .max(200),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIP = getClientIP(request);
    const { threshold } = getRateLimitConfig("public");
    const rateLimitResult = rateLimiter.check(`cart-price:${clientIP}`, threshold);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult.retryAfter ?? 60) as unknown as NextResponse;
    }

    const body: unknown = await request.json().catch(() => null);
    const parseResult = PriceRequestSchema.safeParse(body);
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

    const lines = parseResult.data.items
      .filter((i) => Number.isFinite(i.quantity) && Number.isInteger(i.quantity) && i.quantity > 0)
      .map((i) => ({
        productId: i.productId,
        variantId: i.variantId ?? null,
        quantity: i.quantity,
      }));

    const priced = await priceCartLines(lines);
    return NextResponse.json(priced, { status: 200 });
  } catch (error: unknown) {
    logger.error("Guest cart pricing failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to price cart", code: "internal_error" } },
      { status: 500 }
    );
  }
}
