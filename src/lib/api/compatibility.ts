/**
 * Compatibility data layer (HUB-28).
 *
 * Reads CompatibilityAttribute rows — a product's compatible devices,
 * connector types, OS-support levels, voltage/current requirements and
 * compatible consumables (PRD §5.2) — plus the product-level general
 * warning. See CompatibilityAttribute's doc comment in prisma/schema.prisma
 * for why this is one flexible table with a fixed `type` enum rather than
 * five separate typed tables, and for how per-fact warnings
 * (CompatibilityAttribute.warningEn/So) relate to the product-level warning
 * (Product.compatibilityWarningEn/So).
 *
 * Mirrors the shape/conventions of src/lib/api/spec-templates.ts.
 *
 * Out of scope here (deferred to later units): the product completeness
 * gate (PRD §5.5) and PDP rendering (HUB-33) — this file only reads data.
 */

import { db } from "@/lib/db";
import type { CompatibilityAttribute, CompatibilityType } from "@/types/database";

/**
 * Fetch the ordered compatibility facts for a single product. Returns an
 * empty array (not an error) when the product has no compatibility data
 * recorded yet, or doesn't exist — callers treat "no facts" as "nothing to
 * show" rather than a failure case, same convention as getSpecTemplate.
 */
export async function getCompatibilityForProduct(
  productId: string
): Promise<CompatibilityAttribute[]> {
  return db.compatibilityAttribute.findMany({
    where: { productId },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });
}

/**
 * Fetch compatibility facts of a single type for a product (e.g. just the
 * DEVICE rows, for a "compatible with" list on the PDP). Thin convenience
 * wrapper — kept separate from getCompatibilityForProduct rather than
 * folded in via an optional filter argument, matching the one-purpose-per-
 * export style of the rest of src/lib/api/.
 */
export async function getCompatibilityForProductByType(
  productId: string,
  type: CompatibilityType
): Promise<CompatibilityAttribute[]> {
  return db.compatibilityAttribute.findMany({
    where: { productId, type },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Future "fits your device" filtering (PRD §5.2): given a compatibility
 * type and a stable valueSlug (e.g. type=DEVICE, valueSlug="iphone-15"),
 * return the ids of every product that declares that fact. Intentionally
 * returns ids only, not full products — callers compose this with
 * src/lib/api/products.ts's own listing query rather than this file
 * reaching into Product filtering itself.
 */
export async function getProductIdsCompatibleWith(
  type: CompatibilityType,
  valueSlug: string
): Promise<string[]> {
  const rows = await db.compatibilityAttribute.findMany({
    where: { type, valueSlug },
    select: { productId: true },
  });
  return rows.map((row) => row.productId);
}
