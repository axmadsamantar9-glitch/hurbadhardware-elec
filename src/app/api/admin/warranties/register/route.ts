/**
 * POST /api/admin/warranties/register -- manual warranty registration
 * (HUB-42 AC3). ADMIN-only, same auth pattern as
 * src/app/api/admin/payments/route.ts. Calls registerWarrantyForOrderItem
 * with source MANUAL + registeredByUserId=session.user.id, and writes a
 * "warranty.register" AuditLog row via src/lib/audit.ts's writeAuditLog --
 * both inside the same transaction (PRD §9.3 / src/lib/audit.ts's doc
 * comment: a failed action can never leave an orphaned audit row).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { registerWarrantyForOrderItem } from "@/lib/warranty/register";
import { writeAuditLog } from "@/lib/audit";

const RegisterWarrantySchema = z.object({
  orderItemId: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      );
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: { message: "Admin access required", code: "forbidden" } },
        { status: 403 }
      );
    }

    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(
      `admin-warranty-register:${session.user.id}`,
      threshold
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parseResult = RegisterWarrantySchema.safeParse(body);
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

    const orderItem = await db.orderItem.findUnique({
      where: { id: parseResult.data.orderItemId },
      select: { id: true },
    });
    if (!orderItem) {
      return NextResponse.json(
        { error: { message: "Order item not found", code: "not_found" } },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const warranty = await registerWarrantyForOrderItem(tx, {
        orderItemId: parseResult.data.orderItemId,
        source: "MANUAL",
        registeredByUserId: session.user.id,
      });

      await writeAuditLog(tx, {
        actorId: session.user.id,
        action: "warranty.register",
        entityType: "warranty",
        entityId: warranty.id,
        after: { orderItemId: parseResult.data.orderItemId, source: "MANUAL" },
      });

      return warranty;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    logger.error("admin_warranty_register_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to register warranty", code: "internal_error" } },
      { status: 500 }
    );
  }
}
