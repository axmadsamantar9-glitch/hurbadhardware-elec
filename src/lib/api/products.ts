/**
 * Product data layer (U5).
 *
 * Handles product queries with pagination, full-text search via tsvector,
 * and filtering by category, brand, and price range.
 */

import { z } from "zod";
import { Decimal as PrismaDecimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@/types/database";
import { db } from "@/lib/db";
import type { ProductListItem } from "@/types/database";

/**
 * Zod schema for query parameters. Defines validation rules and provides
 * type safety for the getProducts function.
 */
export const GetProductsQuerySchema = z.object({
  page: z.string().optional().pipe(z.coerce.number().int().positive().default(1)),
  limit: z.string().optional().pipe(z.coerce.number().int().positive().max(100).default(20)),
  search: z.string().optional().default(""),
  category: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  priceMin: z.string().optional().pipe(z.coerce.number().nonnegative().optional()),
  priceMax: z.string().optional().pipe(z.coerce.number().nonnegative().optional()),
});

export type GetProductsQuery = z.infer<typeof GetProductsQuerySchema>;

/**
 * Response shape for getProducts(): paginated products with metadata.
 */
export type GetProductsResponse = {
  products: ProductListItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

/**
 * Query products with pagination, search, and filters.
 *
 * Accepts:
 *   - page: 1-based page number (default 1)
 *   - limit: results per page, max 100 (default 20)
 *   - search: full-text search against product name, description, and brand
 *   - category: filter by category slug or name
 *   - brand: filter by brand (partial match)
 *   - priceMin / priceMax: filter by price range (inclusive)
 *
 * Returns paginated results with total count and pagination metadata.
 * If filters are invalid or missing, they are ignored gracefully (no error).
 *
 * Security: All filtering done via Prisma's parameterized query builder.
 * FTS uses raw SQL only for the tsvector operator Prisma doesn't support,
 * with proper parameter substitution.
 */
export async function getProducts(query: GetProductsQuery): Promise<GetProductsResponse> {
  const { page, limit, search, category, brand, priceMin, priceMax } = query;

  // Defensive check: enforce max limit to prevent abuse
  if (limit > 100) {
    throw new Error("Limit exceeds maximum of 100 items per page");
  }

  // Build Prisma where clause for all filters (category, brand, price).
  // These are always applied via Prisma's safe parameterized query builder.
  const where: Prisma.ProductWhereInput = { isActive: true };

  // --- Category filter: match by slug or name (EN or SO)
  if (category) {
    where.OR = [
      { category: { slug: category.toLowerCase() } },
      { category: { nameEn: { contains: category, mode: "insensitive" } } },
      { category: { nameSo: { contains: category, mode: "insensitive" } } },
    ];
  }

  // --- Brand filter (partial match, case-insensitive)
  if (brand) {
    where.brand = { contains: brand, mode: "insensitive" };
  }

  // --- Price range filter
  const priceGte = priceMin !== undefined ? new PrismaDecimal(priceMin.toString()) : undefined;
  const priceLte = priceMax !== undefined ? new PrismaDecimal(priceMax.toString()) : undefined;

  if (priceGte !== undefined || priceLte !== undefined) {
    where.basePriceUsd = {};
    if (priceGte !== undefined) where.basePriceUsd.gte = priceGte;
    if (priceLte !== undefined) where.basePriceUsd.lte = priceLte;
  }

  // Pagination
  const skip = Math.max(0, (page - 1) * limit);

  let results: ProductListItem[] = [];
  let total = 0;

  // --- Full-text search via tsvector
  // When search is provided, we first get matching IDs from FTS, then apply
  // all other filters via Prisma's safe query builder (no dynamic SQL).
  if (search && search.trim()) {
    const searchQuery = search.trim();

    // Step 1: Get ALL product IDs matching the FTS query (no pagination yet).
    // This is the ONLY place we use raw SQL, and only for the tsvector operator
    // which Prisma doesn't support. The search term is properly parameterized.
    const ftsMatches = await db.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT p.id
      FROM products p
      WHERE p.is_active = true
        AND p.search_vector @@ plainto_tsquery('english', ${searchQuery})
    `;

    if (ftsMatches.length === 0) {
      // No FTS matches: return empty results
      total = 0;
    } else {
      // Step 2: Apply all other filters via Prisma's safe where clause.
      // Use Prisma to filter the FTS-matched IDs by category, brand, price.
      const searchWhereClause: Prisma.ProductWhereInput = {
        ...where,
        id: { in: ftsMatches.map((m) => m.id) },
      };

      // Count total matching products after applying all filters
      total = await db.product.count({ where: searchWhereClause });

      // Fetch paginated results
      if (total > 0) {
        results = await db.product.findMany({
          where: searchWhereClause,
          include: {
            images: true,
            category: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        });
      }
    }
  } else {
    // Standard query without FTS: use Prisma query builder for all operations.
    total = await db.product.count({ where });

    results = await db.product.findMany({
      where,
      include: {
        images: true,
        category: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
  }

  return {
    products: results,
    total,
    page,
    limit,
    hasMore: skip + limit < total,
  };
}
