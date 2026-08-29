/**
 * Brand data layer (HUR-55 AC1).
 *
 * Brands are an independently queryable entity, distinct from a product's
 * FK relation — this powers /brands listing and /brands/[slug] pages.
 * Mirrors the shape/conventions of src/lib/api/categories.ts.
 */

import { db } from "@/lib/db";
import type { Brand } from "@/types/database";

/**
 * List every active brand, ordered alphabetically by English name.
 */
export async function getBrands(): Promise<Brand[]> {
  return db.brand.findMany({
    where: { isActive: true },
    orderBy: { nameEn: "asc" },
  });
}

/**
 * Look up a single active brand by slug. Returns null if not found or
 * inactive — inactive brands are treated the same as "does not exist" for
 * public callers (mirrors getProductBySlug()'s `isActive` handling
 * elsewhere in this module family).
 */
export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  return db.brand.findFirst({
    where: { slug, isActive: true },
  });
}
