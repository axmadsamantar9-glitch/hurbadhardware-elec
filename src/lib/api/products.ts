/**
 * Product data layer (U5).
 *
 * Handles product queries with pagination, full-text search via tsvector,
 * and filtering by category, brand, price range, and stock availability.
 * Also exposes single-product lookup by slug (U7) for the product detail page.
 */

import { z } from "zod";
import { Decimal as PrismaDecimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@/types/database";
import { db } from "@/lib/db";
import type { ProductListItem, ProductWithRelations } from "@/types/database";

/** Sort options for `getProducts()`. Default is `newest`. */
export const PRODUCT_SORTS = ["price_asc", "price_desc", "newest", "rating", "popularity"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * Default page size (HUR-15/AC6): 24. Chosen over the previously-shipped
 * default of 20 because no Module 05 (catalog UI) consumer exists yet to
 * depend on 20 — this data layer and its route are the only callers today
 * (see src/lib/api/products.test.ts, src/app/api/products/route.ts), so
 * aligning with the HUR-15 spec now is free. If a UI consumer starts relying
 * on a specific page size, treat that call site as the source of truth
 * instead of this constant.
 */
export const DEFAULT_PAGE_SIZE = 24;

/**
 * Zod schema for query parameters. Defines validation rules and provides
 * type safety for the getProducts function.
 */
export const GetProductsQuerySchema = z.object({
  page: z.string().optional().pipe(z.coerce.number().int().positive().default(1)),
  limit: z
    .string()
    .optional()
    .pipe(z.coerce.number().int().positive().max(100).default(DEFAULT_PAGE_SIZE)),
  search: z.string().optional().default(""),
  category: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  priceMin: z.string().optional().pipe(z.coerce.number().nonnegative().optional()),
  priceMax: z.string().optional().pipe(z.coerce.number().nonnegative().optional()),
  // "true" -> true, anything else (including absent) -> undefined (no filter).
  // Deliberately not z.coerce.boolean(), which treats the literal string
  // "false" as truthy (any non-empty string coerces to true).
  inStock: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sort: z.enum(PRODUCT_SORTS).optional(),
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
 * Query products with pagination, search, filters, and sort.
 *
 * Accepts:
 *   - page: 1-based page number (default 1)
 *   - limit: results per page, max 100 (default DEFAULT_PAGE_SIZE)
 *   - search: full-text search against product name, description, and brand
 *   - category: filter by category slug or name
 *   - brand: filter by brand name (partial match against Brand.nameEn/nameSo,
 *     post-HUB-26 relation filter, not a free-text column)
 *   - priceMin / priceMax: filter by price range (inclusive)
 *   - inStock: when true, exclude products with stockQuantity <= 0
 *   - sort: 'price_asc' | 'price_desc' | 'newest' (default) | 'rating' | 'popularity'
 *
 * Returns paginated results with total count and pagination metadata.
 * If filters are invalid or missing, they are ignored gracefully (no error).
 *
 * Security: All filtering done via Prisma's parameterized query builder.
 * FTS uses raw SQL only for the tsvector operator Prisma doesn't support,
 * with proper parameter substitution.
 */
export async function getProducts(query: GetProductsQuery): Promise<GetProductsResponse> {
  const { page, limit, search, category, brand, priceMin, priceMax, inStock, sort } = query;

  // Defensive check: enforce max limit to prevent abuse
  if (limit > 100) {
    throw new Error("Limit exceeds maximum of 100 items per page");
  }

  // Build Prisma where clause for all filters (category, brand, price, stock).
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

  // --- Brand filter (relation, partial match on either locale name,
  // case-insensitive). Post-HUB-26: `brand` is the Brand relation, not a
  // free-text column.
  if (brand) {
    where.brand = {
      is: {
        OR: [
          { nameEn: { contains: brand, mode: "insensitive" } },
          { nameSo: { contains: brand, mode: "insensitive" } },
        ],
      },
    };
  }

  // --- Price range filter
  const priceGte = priceMin !== undefined ? new PrismaDecimal(priceMin.toString()) : undefined;
  const priceLte = priceMax !== undefined ? new PrismaDecimal(priceMax.toString()) : undefined;

  if (priceGte !== undefined || priceLte !== undefined) {
    where.basePriceUsd = {};
    if (priceGte !== undefined) where.basePriceUsd.gte = priceGte;
    if (priceLte !== undefined) where.basePriceUsd.lte = priceLte;
  }

  // --- Stock filter: exclude zero/negative stock when inStock=true
  if (inStock === true) {
    where.stockQuantity = { gt: 0 };
  }

  // Pagination
  const skip = Math.max(0, (page - 1) * limit);

  let results: ProductListItem[] = [];
  let total = 0;

  // --- Full-text search via tsvector
  // When search is provided, we first get matching IDs from FTS, then apply
  // all other filters via Prisma's safe query builder (no dynamic SQL). The
  // resulting `effectiveWhere` (below) is used for both the count and the
  // eventual product fetch, regardless of which sort strategy is used.
  let effectiveWhere: Prisma.ProductWhereInput = where;
  let noMatches = false;

  if (search && search.trim()) {
    const searchQuery = search.trim();

    // Get ALL product IDs matching the FTS query (no pagination yet). This is
    // the ONLY place we use raw SQL, and only for the tsvector operator which
    // Prisma doesn't support. The search term is properly parameterized.
    const ftsMatches = await db.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT p.id
      FROM products p
      WHERE p.is_active = true
        AND p.search_vector @@ plainto_tsquery('english', ${searchQuery})
    `;

    if (ftsMatches.length === 0) {
      noMatches = true;
    } else {
      effectiveWhere = { ...where, id: { in: ftsMatches.map((m) => m.id) } };
    }
  }

  if (noMatches) {
    total = 0;
  } else {
    total = await db.product.count({ where: effectiveWhere });

    if (total > 0) {
      if (sort === "rating" || sort === "popularity") {
        results = await getProductsSortedByAggregate(effectiveWhere, sort, skip, limit);
      } else {
        results = await db.product.findMany({
          where: effectiveWhere,
          include: {
            images: true,
            category: true,
            brand: true,
          },
          orderBy: resolveSimpleOrderBy(sort),
          skip,
          take: limit,
        });
      }
    }
  }

  return {
    products: results,
    total,
    page,
    limit,
    hasMore: skip + limit < total,
  };
}

/** Prisma `orderBy` for the sort values that don't require aggregation. */
function resolveSimpleOrderBy(
  sort: ProductSort | undefined
): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "price_asc":
      return { basePriceUsd: "asc" };
    case "price_desc":
      return { basePriceUsd: "desc" };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

/**
 * Sort by an aggregate (average rating or total units sold) that Prisma
 * cannot express in a single `orderBy`. Strategy (architect-designed, HUB-25
 * AC2): fetch every matching id (cheap — id + createdAt only, no
 * pagination), aggregate scores via `groupBy`, sort in application code
 * (ties broken by `createdAt desc` for deterministic pagination), slice the
 * requested page of ids, then fetch and reorder that page's full records —
 * Prisma's `id: { in: [...] }` does not preserve input order.
 */
async function getProductsSortedByAggregate(
  where: Prisma.ProductWhereInput,
  sort: "rating" | "popularity",
  skip: number,
  limit: number
): Promise<ProductListItem[]> {
  const idRows = await db.product.findMany({
    where,
    select: { id: true, createdAt: true },
  });
  const ids = idRows.map((r) => r.id);

  const scoreMap = new Map<string, number>();
  if (sort === "rating") {
    const ratings = await db.review.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, isApproved: true },
      _avg: { rating: true },
    });
    for (const r of ratings) scoreMap.set(r.productId, r._avg.rating ?? 0);
  } else {
    const quantities = await db.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, order: { status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
    });
    for (const q of quantities) {
      if (q.productId) scoreMap.set(q.productId, q._sum.quantity ?? 0);
    }
  }

  const sorted = [...idRows].sort((a, b) => {
    const scoreA = scoreMap.get(a.id) ?? 0;
    const scoreB = scoreMap.get(b.id) ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA; // highest score first
    return b.createdAt.getTime() - a.createdAt.getTime(); // tie-break: newest first
  });

  const pageIds = sorted.slice(skip, skip + limit).map((r) => r.id);
  if (pageIds.length === 0) return [];

  const pageProducts = await db.product.findMany({
    where: { id: { in: pageIds } },
    include: { images: true, category: true, brand: true },
  });

  // Reorder to match `pageIds` — Prisma's `id: { in: [...] }` does not
  // guarantee result order matches the input array.
  const order = new Map(pageIds.map((id, i) => [id, i]));
  return pageProducts.slice().sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * Look up multiple active products by id, for the comparison page (HUR-26,
 * U7 / PRD R5). Returns full relations (specs included, needed for the
 * spec-sheet comparison table) — same shape as `getProductBySlug()`.
 *
 * Deliberately silent about missing/inactive ids (e.g. a bookmarked compare
 * URL where a product was later deactivated) rather than erroring — the
 * caller renders whatever subset is still found, matching `getProducts()`'s
 * "invalid/missing filters are ignored gracefully" convention. Does NOT
 * preserve `ids` order (Prisma's `id: { in: [...] }` doesn't guarantee it);
 * callers that care about order must reorder the result themselves.
 */
export async function getProductsByIds(ids: string[]): Promise<ProductWithRelations[]> {
  if (ids.length === 0) return [];
  return db.product.findMany({
    where: { id: { in: ids }, isActive: true },
    include: {
      images: true,
      specs: true,
      variants: true,
      category: true,
      brand: true,
      manufacturer: true,
    },
  });
}

/**
 * Look up a single product by slug for the product detail page (U7).
 *
 * Returns raw `nameEn`/`nameSo` (and other bilingual fields) without
 * resolving locale server-side, matching the convention established by
 * `getProducts()` and `src/lib/locale-field.ts` (HUB-22): locale resolution
 * happens at the render/serialization boundary via `localeField()` /
 * `useLocaleField()`, not inside the data-access layer. The `locale`
 * parameter is accepted for API symmetry with the rest of this module and
 * for future callers that may want to log/vary by it, but is otherwise
 * unused here.
 */
export async function getProductBySlug(
  slug: string,
  locale?: string
): Promise<ProductWithRelations | null> {
  void locale; // accepted for API symmetry; see doc comment above — resolution happens elsewhere.
  return db.product.findUnique({
    where: { slug },
    include: {
      images: true,
      specs: true,
      variants: true,
      category: true,
      brand: true,
      manufacturer: true,
    },
  });
}
