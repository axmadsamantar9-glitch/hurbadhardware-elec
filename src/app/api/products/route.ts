/**
 * GET /api/products — Product listing endpoint (U5).
 *
 * Query parameters:
 *   - page (default 1): 1-based page number
 *   - limit (default 24, max 100): results per page — see DEFAULT_PAGE_SIZE
 *     in src/lib/api/products.ts for the AC6 reasoning
 *   - search: full-text search term
 *   - category: filter by category slug or name
 *   - brand: filter by brand (partial match)
 *   - priceMin: minimum price (USD)
 *   - priceMax: maximum price (USD)
 *   - inStock: "true" to exclude zero-stock products
 *   - sort: price_asc | price_desc | newest (default) | rating | popularity
 *
 * Returns: { products: PublicProductListItem[], total, page, limit, hasMore }
 *
 * Caching (AC7): `Cache-Control` response header, not the App Router
 * `export const revalidate` segment config — this file is a Route Handler
 * (not a page/layout), and Route Handlers only respect `revalidate` for
 * cached `fetch()` calls they make, not for shaping their own response;
 * this handler calls Prisma directly, not `fetch()`. `Cache-Control`
 * headers are also the pre-existing precedent in this repo for this exact
 * route. TTL aligned to 60s (down from the previous 300s) to match the
 * HUR-15 spec's `revalidate = 60` intent, applied consistently across
 * /api/products, /api/products/[slug], and /api/categories.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProducts,
  GetProductsQuerySchema,
  DEFAULT_PAGE_SIZE,
  type GetProductsQuery,
} from "@/lib/api/products";
import { toPublicProducts } from "@/lib/api/serialize-product";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP, createRateLimitResponse } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";

/** Shared Cache-Control value for all catalog (product/category) routes — see AC7 note above. */
export const CATALOG_CACHE_CONTROL = "public, max-age=60, s-maxage=60";

/**
 * Parse and validate query parameters from the URL.
 */
function parseQueryParams(request: NextRequest): z.SafeParseReturnType<unknown, GetProductsQuery> {
  const { searchParams } = new URL(request.url);

  const queryData = {
    page: searchParams.get("page") || "1",
    limit: searchParams.get("limit") || String(DEFAULT_PAGE_SIZE),
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    brand: searchParams.get("brand") || "",
    priceMin: searchParams.get("priceMin") || undefined,
    priceMax: searchParams.get("priceMax") || undefined,
    inStock: searchParams.get("inStock") || undefined,
    sort: searchParams.get("sort") || undefined,
  };

  return GetProductsQuerySchema.safeParse(queryData);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit unauthenticated public reads (docs/guidelines/rate-limiting.md
    // PUBLIC tier: 30 req/min per IP). The sort=rating/popularity aggregate
    // path runs an unbounded groupBy over all matching rows on every request,
    // regardless of pagination, so this endpoint is genuinely abuse-worthy.
    const clientIP = getClientIP(request);
    const { threshold } = getRateLimitConfig("public");
    const rateLimitResult = rateLimiter.check(`public:${clientIP}`, threshold);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult.retryAfter ?? 60) as unknown as NextResponse;
    }

    // Parse and validate query parameters
    const parseResult = parseQueryParams(request);

    if (!parseResult.success) {
      // Log validation errors for debugging
      logger.warn("Invalid product query parameters", {
        errors: parseResult.error.errors,
        url: request.url,
      });

      // Return 400 with error details
      return NextResponse.json(
        {
          error: {
            message: "Invalid query parameters",
            code: "validation_error",
            issues: parseResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    // Query products with validated parameters
    const result = await getProducts(parseResult.data);

    // Redact internal inventory counts (Iron Rule #6) before returning to
    // the client — see src/lib/api/serialize-product.ts.
    const response = { ...result, products: toPublicProducts(result.products) };

    // Return successful response
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": CATALOG_CACHE_CONTROL,
      },
    });
  } catch (error: unknown) {
    // Log the error without exposing details to the client
    logger.error("Product query failed", {
      error: error instanceof Error ? error.message : String(error),
      url: request.url,
    });

    return NextResponse.json(
      {
        error: {
          message: "Failed to fetch products",
          code: "internal_error",
        },
      },
      { status: 500 }
    );
  }
}
