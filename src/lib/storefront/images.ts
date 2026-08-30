/**
 * Pure sort helper for product image galleries (U7).
 *
 * Rule: the primary image (ProductImage.isPrimary, enforced unique per
 * product by a partial unique index — HUB-28, prisma/manual-sql/
 * 004_product_image_primary_unique.sql) always comes first; the rest follow
 * their stored `position` ascending. A product with no primary image (data
 * gap) simply falls back to position order.
 */

import type { ProductImage } from "@/types/database";

export function sortProductImages<T extends Pick<ProductImage, "isPrimary" | "position">>(
  images: T[]
): T[] {
  return [...images].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.position - b.position;
  });
}
