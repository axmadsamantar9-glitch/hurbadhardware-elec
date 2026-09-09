/**
 * POST /api/warranties/[id]/claims -- create a WarrantyClaim (HUB-42 AC6).
 *
 * Ownership check happens INSIDE the Prisma `where` clause
 * (`db.warranty.findFirst({ where: { id, userId } })`), matching the
 * IDOR-safety convention used everywhere else in this codebase (see
 * src/lib/api/orders.ts's getOrderDetailForUser doc comment). A claim
 * against someone else's warranty id 404s -- identical to a nonexistent id
 * -- never a 403, so this endpoint can't be used to confirm a warranty id
 * belongs to another customer.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";

const CreateClaimSchema = z.object({
  claimReason: z.string().min(1).max(200),
  customerDescription: z.string().max(2000).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      );
    }

    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(`warranty-claims:${session.user.id}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const { id } = await params;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = CreateClaimSchema.safeParse(body);
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

    // Ownership check IN the where clause -- a warranty that exists but
    // belongs to another user 404s identically to a nonexistent id.
    const warranty = await db.warranty.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!warranty) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const claim = await db.warrantyClaim.create({
      data: {
        warrantyId: warranty.id,
        userId: session.user.id,
        claimReason: parseResult.data.claimReason,
        customerDescription: parseResult.data.customerDescription ?? null,
        status: "REQUESTED",
      },
      select: { id: true, status: true, createdAt: true },
    });

    return NextResponse.json(claim, { status: 201 });
  } catch (error: unknown) {
    logger.error("warranty_claim_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to create claim", code: "internal_error" } },
      { status: 500 }
    );
  }
}
