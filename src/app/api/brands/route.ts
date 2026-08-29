/**
 * GET /api/brands — Brand catalog endpoint (HUR-55 AC3).
 *
 * Returns every active brand. No query parameters. Follows the same
 * rate-limiting/caching conventions as src/app/api/categories/route.ts.
 *
 * Security (HUR-55 AC2): this route only ever calls `getBrands()`
 * (src/lib/api/brands.ts), which selects the public `Brand` model directly —
 * there is no supplier data reachable from this query at all.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBrands } from "@/lib/api/brands";
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

    const brands = await getBrands();

    return NextResponse.json(
      { brands },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": CATALOG_CACHE_CONTROL,
        },
      }
    );
  } catch (error: unknown) {
    logger.error("Brand query failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: { message: "Failed to fetch brands", code: "internal_error" } },
      { status: 500 }
    );
  }
}
