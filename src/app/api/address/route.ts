/**
 * /api/address — authenticated shipping address list/create (HUR-191, U11
 * checkout).
 *
 * GET  -> list the current user's saved addresses.
 * POST -> create a new address owned by the current user. Body has no
 *         `userId` field — the acting user is always session-derived (see
 *         src/app/api/wishlist/route.ts / src/app/api/cart/route.ts
 *         precedent).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { listAddresses, createAddress } from "@/lib/api/address";

const CreateAddressSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  addressLine1: z.string().min(1),
  addressLine2: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().min(1).optional(),
  country: z.enum(["SO", "KE", "ET"]),
  isDefault: z.boolean().optional(),
});

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
  const rateLimitResult = rateLimiter.check(`address:${userId}`, threshold);
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

    const addresses = await listAddresses(gate.userId);
    return NextResponse.json({ addresses }, { status: 200 });
  } catch (error: unknown) {
    logger.error("Address list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to fetch addresses", code: "internal_error" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const gate = await requireUser();
    if ("errorResponse" in gate) return gate.errorResponse;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = CreateAddressSchema.safeParse(body);
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

    const address = await createAddress(gate.userId, parseResult.data);
    return NextResponse.json({ address }, { status: 201 });
  } catch (error: unknown) {
    logger.error("Address create failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to create address", code: "internal_error" } },
      { status: 500 }
    );
  }
}
