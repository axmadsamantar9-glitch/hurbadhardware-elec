/**
 * GET /api/admin/warranties -- warranty search (HUB-42 AC5). ADMIN-only,
 * same auth pattern as src/app/api/admin/payments/route.ts.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { searchWarranties } from "@/lib/api/warranties";
import type { WarrantyStatusResult } from "@/lib/warranty/status";

const VALID_STATUSES: WarrantyStatusResult[] = [
  "ACTIVE",
  "EXPIRING_SOON",
  "EXPIRED",
  "VOID",
  "NOT_COVERED",
];

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
    const rateLimitResult = rateLimiter.check(`admin-warranties:${session.user.id}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam && VALID_STATUSES.includes(statusParam as WarrantyStatusResult)
        ? (statusParam as WarrantyStatusResult)
        : undefined;

    const result = await searchWarranties({
      customerEmail: url.searchParams.get("customerEmail") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      orderId: url.searchParams.get("orderId") ?? undefined,
      sku: url.searchParams.get("sku") ?? undefined,
      serialNumber: url.searchParams.get("serialNumber") ?? undefined,
      warrantyId: url.searchParams.get("warrantyId") ?? undefined,
      status,
      page: Number(url.searchParams.get("page") ?? "1"),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    logger.error("admin_warranties_search_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to search warranties", code: "internal_error" } },
      { status: 500 }
    );
  }
}
