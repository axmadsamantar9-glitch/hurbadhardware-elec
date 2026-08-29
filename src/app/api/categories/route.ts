/**
 * GET /api/categories — Category navigation tree endpoint (U8).
 *
 * Returns every active category assembled into a parent -> children tree
 * (see src/lib/api/categories.ts for the tree-building strategy). No query
 * parameters.
 *
 * Caching: see the AC7 note in src/app/api/products/route.ts —
 * `Cache-Control` header, 60s TTL, consistent across all catalog routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCategories } from "@/lib/api/categories";
import { CATALOG_CACHE_CONTROL } from "@/app/api/products/route";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP, createRateLimitResponse } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit unauthenticated public reads (docs/guidelines/rate-limiting.md
    // PUBLIC tier: 30 req/min per IP) — see src/app/api/products/route.ts.
    const clientIP = getClientIP(request);
    const { threshold } = getRateLimitConfig("public");
    const rateLimitResult = rateLimiter.check(`public:${clientIP}`, threshold);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult.retryAfter ?? 60) as unknown as NextResponse;
    }

    const categories = await getCategories();

    return NextResponse.json(
      { categories },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": CATALOG_CACHE_CONTROL,
        },
      }
    );
  } catch (error: unknown) {
    logger.error("Category query failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: { message: "Failed to fetch categories", code: "internal_error" } },
      { status: 500 }
    );
  }
}
