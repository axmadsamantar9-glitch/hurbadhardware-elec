/**
 * GET /api/products — Product listing endpoint (U5).
 *
 * Query parameters:
 *   - page (default 1): 1-based page number
 *   - limit (default 20, max 100): results per page
 *   - search: full-text search term
 *   - category: filter by category slug or name
 *   - brand: filter by brand (partial match)
 *   - priceMin: minimum price (USD)
 *   - priceMax: maximum price (USD)
 *
 * Returns: { products: ProductListItem[], total, page, limit, hasMore }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProducts, GetProductsQuerySchema, type GetProductsQuery } from "@/lib/api/products";
import { logger } from "@/lib/logger";

/**
 * Parse and validate query parameters from the URL.
 */
function parseQueryParams(request: NextRequest): z.SafeParseReturnType<unknown, GetProductsQuery> {
  const { searchParams } = new URL(request.url);

  const queryData = {
    page: searchParams.get("page") || "1",
    limit: searchParams.get("limit") || "20",
    search: searchParams.get("search") || "",
    category: searchParams.get("category") || "",
    brand: searchParams.get("brand") || "",
    priceMin: searchParams.get("priceMin") || undefined,
    priceMax: searchParams.get("priceMax") || undefined,
  };

  return GetProductsQuerySchema.safeParse(queryData);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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

    // Return successful response
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=300", // 5-minute cache
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
