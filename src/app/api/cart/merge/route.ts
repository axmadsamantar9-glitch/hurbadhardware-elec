/**
 * POST /api/cart/merge -- merge a guest (localStorage) cart into the
 * signed-in user's DB cart on login (HUR-190 scope item 5).
 *
 * Body: { items: { productId, variantId?, quantity }[] } -- the guest cart's
 * raw line list, as read from src/store/cartStore.ts client-side. Quantities
 * are summed for lines that already exist in the DB cart. The caller (see
 * src/components/storefront/cart-merge-listener.tsx) clears localStorage only
 * after this responds successfully.
 *
 * Same auth/ownership trust boundary as src/app/api/cart/route.ts:
 * `userId` is always session-derived, never client-supplied.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { mergeGuestCartIntoDb, getCartLinesPriced } from "@/lib/api/cart";

const MergeSchema = z.object({
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(`cart-merge:${userId}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: {
            message: "Rate limit exceeded",
            code: "rate_limit_exceeded",
            retryAfter: rateLimitResult.retryAfter,
          },
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parseResult = MergeSchema.safeParse(body);
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

    const lines = parseResult.data.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId ?? null,
      quantity: i.quantity,
    }));

    await mergeGuestCartIntoDb(userId, lines);

    const cart = await getCartLinesPriced(userId);
    return NextResponse.json(cart, { status: 200 });
  } catch (error: unknown) {
    logger.error("Cart merge failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to merge cart", code: "internal_error" } },
      { status: 500 }
    );
  }
}
