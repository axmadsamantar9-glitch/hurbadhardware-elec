/**
 * GET /api/admin/payments -- read-only payment review list (U23, AC10).
 * ADMIN-only, same auth pattern as src/app/api/admin/uploads/presign/route.ts.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { listPaymentsForReview } from "@/lib/payments/admin";

export async function GET(request: Request): Promise<NextResponse> {
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
    const rateLimitResult = rateLimiter.check(`admin-payments:${session.user.id}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = await listPaymentsForReview({ page });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    logger.error("admin_payments_list_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to list payments", code: "internal_error" } },
      { status: 500 }
    );
  }
}
