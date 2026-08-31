/**
 * /api/cart -- authenticated (DB-backed) cart read/add/update/remove
 * (HUR-190, U9 / PRD R8, KTD10).
 *
 * GET   -> the current user's cart, re-priced live against the DB (Iron
 *          Rule #1 -- never returns/trusts a cached price).
 * POST  -> add a product (optionally a variant) to the current user's cart.
 *          Body: { productId, variantId?, quantity }. Any client-submitted
 *          price field is never read (the schema doesn't accept one).
 * PATCH -> set a cart line's quantity to an exact value.
 *          Body: { cartItemId, quantity }.
 * DELETE -> remove a single cart line. Body: { cartItemId }.
 *
 * Trust boundary (matches src/app/api/wishlist/route.ts precedent):
 * `userId` is ALWAYS taken from `session.user.id` (server-side, via
 * `auth()`), never from the request body. Every query in src/lib/api/cart.ts
 * is scoped to that id.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import {
  getCartLinesPriced,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
} from "@/lib/api/cart";

const AddItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
});

const UpdateQuantitySchema = z.object({
  cartItemId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const RemoveItemSchema = z.object({
  cartItemId: z.string().min(1),
});

/** Shared auth + rate-limit gate, mirrors src/app/api/wishlist/route.ts's `requireUser()`. */
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
  // Namespaced key (`cart:<userId>`) so this never collides with any other
  // rateLimiter.check() call site (HUR-15 cross-endpoint-collision lesson).
  const rateLimitResult = rateLimiter.check(`cart:${userId}`, threshold);
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

    const cart = await getCartLinesPriced(gate.userId);
    return NextResponse.json(cart, { status: 200 });
  } catch (error: unknown) {
    logger.error("Cart fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to fetch cart", code: "internal_error" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = AddItemSchema.safeParse(body);
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

    const { productId, variantId, quantity } = parseResult.data;
    const result = await addCartItem(gate.userId, { productId, variantId, quantity });
    if (!result.ok) {
      const status = result.error === "invalid_quantity" ? 400 : 404;
      return NextResponse.json(
        { error: { message: "Unable to add item", code: result.error } },
        { status }
      );
    }

    const cart = await getCartLinesPriced(gate.userId);
    return NextResponse.json(cart, { status: 200 });
  } catch (error: unknown) {
    logger.error("Cart add failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to add to cart", code: "internal_error" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = UpdateQuantitySchema.safeParse(body);
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

    const { cartItemId, quantity } = parseResult.data;
    const result = await updateCartItemQuantity(gate.userId, cartItemId, quantity);
    if (!result.ok) {
      const status = result.error === "invalid_quantity" ? 400 : 404;
      return NextResponse.json(
        { error: { message: "Unable to update item", code: result.error } },
        { status }
      );
    }

    const cart = await getCartLinesPriced(gate.userId);
    return NextResponse.json(cart, { status: 200 });
  } catch (error: unknown) {
    logger.error("Cart update failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to update cart item", code: "internal_error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = RemoveItemSchema.safeParse(body);
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

    await removeCartItem(gate.userId, parseResult.data.cartItemId);

    const cart = await getCartLinesPriced(gate.userId);
    return NextResponse.json(cart, { status: 200 });
  } catch (error: unknown) {
    logger.error("Cart remove failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to remove cart item", code: "internal_error" } },
      { status: 500 }
    );
  }
}
