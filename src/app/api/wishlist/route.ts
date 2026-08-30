/**
 * /api/wishlist — authenticated wishlist add/remove/list (HUB-35, U9 / PRD
 * R9).
 *
 * GET    -> list the current user's wishlisted products (public-shaped, via
 *           `toPublicProducts()` — Iron Rule #6).
 * POST   -> add a product to the current user's wishlist. Body: { productId }.
 * DELETE -> remove a product from the current user's wishlist. Body: { productId }.
 *
 * Trust boundary (first authenticated *write* endpoint in the
 * storefront-adjacent code): `userId` is ALWAYS taken from `session.user.id`
 * (server-side, via `auth()`), never from the request body or any client
 * input. Every query is scoped to that id, so this route can never read or
 * mutate another user's wishlist rows regardless of what a client sends.
 *
 * Layering follows the established order (see
 * src/app/api/admin/uploads/presign/route.ts): rate limit -> auth -> parse
 * body -> business logic. Auth is checked before body parsing so an
 * unauthenticated request never causes body-parsing work.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { addToWishlist, removeFromWishlist, getWishlistProducts } from "@/lib/api/wishlist";
import { toPublicProducts } from "@/lib/api/serialize-product";

const WishlistMutationSchema = z.object({
  productId: z.string().min(1),
});

/**
 * Shared auth + rate-limit gate for all three verbs. Returns the
 * authenticated user's id, or a ready-to-return error `NextResponse`.
 *
 * Namespaced rate-limit key (`wishlist:<userId>`) so this category can never
 * collide with any other `rateLimiter.check()` call site in the app (see
 * docs/agents/learnings/storefront.md's rate-limit-key-namespacing rule).
 */
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
  const { threshold } = getRateLimitConfig("api");
  const rateLimitResult = rateLimiter.check(`wishlist:${userId}`, threshold);
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

export async function GET(): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const products = await getWishlistProducts(gate.userId);
    return NextResponse.json({ products: toPublicProducts(products) }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Wishlist fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to fetch wishlist", code: "internal_error" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = WishlistMutationSchema.safeParse(body);
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

    const result = await addToWishlist(gate.userId, parseResult.data.productId);
    if (!result.ok) {
      return NextResponse.json(
        { error: { message: "Product not found", code: result.error } },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Wishlist add failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to add to wishlist", code: "internal_error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = WishlistMutationSchema.safeParse(body);
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

    await removeFromWishlist(gate.userId, parseResult.data.productId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Wishlist remove failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to remove from wishlist", code: "internal_error" } },
      { status: 500 }
    );
  }
}
