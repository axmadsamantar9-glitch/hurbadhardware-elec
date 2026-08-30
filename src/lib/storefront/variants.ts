/**
 * Pure helpers for the PDP variant selector (U7).
 *
 * `ProductVariant.attributes` is an untyped `Json?` column (schema-level
 * comment: free-form per-variant attribute bag, e.g. `{ "storage": "128GB",
 * "color": "Black" }`). Nothing in the schema constrains its shape, so every
 * helper here defensively coerces to `Record<string, string>` and skips
 * anything that isn't a plain string value rather than throwing — a
 * malformed/legacy variant row must never break the whole PDP.
 */

import type { ProductVariant } from "@/types/database";

export type VariantAttributes = Record<string, string>;

/** Safely coerce a variant's `attributes` Json column to a string-keyed map. */
export function readVariantAttributes(attributes: ProductVariant["attributes"]): VariantAttributes {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return {};
  }
  const result: VariantAttributes = {};
  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Group every distinct attribute key -> the ordered set of distinct values
 * seen across all active variants, e.g. `{ storage: ["128GB", "256GB"],
 * color: ["Black", "Blue"] }`. Used to render one selectable group per
 * attribute key on the PDP.
 */
export function groupVariantOptions(
  variants: Pick<ProductVariant, "attributes" | "isActive">[]
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const variant of variants) {
    if (!variant.isActive) continue;
    const attrs = readVariantAttributes(variant.attributes);
    for (const [key, value] of Object.entries(attrs)) {
      const seen = groups[key] ?? (groups[key] = []);
      if (!seen.includes(value)) seen.push(value);
    }
  }
  return groups;
}

/**
 * Find the single active variant whose attributes exactly match `selection`
 * (every selected key/value pair present on the variant). Returns undefined
 * if no variant matches (e.g. an invalid/partial combination).
 */
export function findMatchingVariant<V extends Pick<ProductVariant, "attributes" | "isActive">>(
  variants: V[],
  selection: VariantAttributes
): V | undefined {
  return variants.find((variant) => {
    if (!variant.isActive) return false;
    const attrs = readVariantAttributes(variant.attributes);
    return Object.entries(selection).every(([key, value]) => attrs[key] === value);
  });
}
