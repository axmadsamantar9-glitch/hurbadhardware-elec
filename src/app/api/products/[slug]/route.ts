/**
 * GET /api/products/[slug] — Product detail endpoint (U7).
 *
 * Returns a single product with its images, specs, variants, and category.
 * Bilingual fields (nameEn/nameSo, descriptionEn/descriptionSo, etc.) are
 * returned raw — locale resolution happens at the render/serialization
 * boundary via `localeField()` / `useLocaleField()` (HUB-22), not here. See
 * the doc comment on `getProductBySlug()` in src/lib/api/products.ts.
 *
 * Caching: see the AC7 note in src/app/api/products/route.ts —
 * `Cache-Control` header, 60s TTL, consistent across all catalog routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/api/products";
import { toPublicProduct } from "@/lib/api/serialize-product";
import { CATALOG_CACHE_CONTROL } from "@/app/api/products/route";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP, createRateLimitResponse } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    // Rate limit unauthenticated public reads (docs/guidelines/rate-limiting.md
    // PUBLIC tier: 30 req/min per IP) — see src/app/api/products/route.ts.
    const clientIP = getClientIP(request);
    const { threshold } = getRateLimitConfig("public");
    const rateLimitResult = rateLimiter.check(`public:${clientIP}`, threshold);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult.retryAfter ?? 60) as unknown as NextResponse;
    }

    const { slug } = await params;

    if (!slug || !slug.trim()) {
      return NextResponse.json(
        { error: { message: "Product slug is required", code: "validation_error" } },
        { status: 400 }
      );
    }

    const product = await getProductBySlug(slug);

    if (!product) {
      return NextResponse.json(
        { error: { message: "Product not found", code: "not_found" } },
        { status: 404 }
      );
    }

    // Redact internal inventory counts (Iron Rule #6) before returning to
    // the client — see src/lib/api/serialize-product.ts.
    return NextResponse.json(toPublicProduct(product), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": CATALOG_CACHE_CONTROL,
      },
    });
  } catch (error: unknown) {
    logger.error("Product detail query failed", {
      error: error instanceof Error ? error.message : String(error),
      url: request.url,
    });

    return NextResponse.json(
      { error: { message: "Failed to fetch product", code: "internal_error" } },
      { status: 500 }
    );
  }
}
