/**
 * Spec template data layer (HUB-27).
 *
 * SpecTemplateKey is purely informational: it tells the (future) admin
 * product-edit form which bilingual spec keys a category typically needs and
 * which are mandatory. It does NOT constrain ProductSpec rows — a product may
 * still carry a spec whose key isn't in its category's template. See the doc
 * comments on SpecTemplateKey / ProductSpec in prisma/schema.prisma for the
 * full rationale.
 *
 * Mirrors the shape/conventions of src/lib/api/categories.ts and brands.ts.
 */

import { db } from "@/lib/db";
import type { SpecTemplateKey } from "@/types/database";

/**
 * Fetch the ordered spec template for a single category. Returns an empty
 * array (not an error) when the category has no template defined yet, or
 * doesn't exist — callers treat "no template" as "no suggested keys" rather
 * than a failure case.
 */
export async function getSpecTemplate(categoryId: string): Promise<SpecTemplateKey[]> {
  return db.specTemplateKey.findMany({
    where: { categoryId },
    orderBy: { sortOrder: "asc" },
  });
}
