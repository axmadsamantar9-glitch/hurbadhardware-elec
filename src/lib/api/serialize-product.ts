/**
 * Public-response serialization for products (Iron Rule #6: no inventory
 * counts, cost data, or admin fields in public API responses).
 *
 * `getProducts()` / `getProductBySlug()` (src/lib/api/products.ts) return the
 * raw Prisma row, including `stockQuantity` — an internal inventory count.
 * That's correct for the data-access layer (callers may legitimately need
 * the exact count for internal/admin surfaces), but every *public* Route
 * Handler must call `toPublicProduct()` / `toPublicProducts()` before
 * returning JSON so the exact count never reaches the client. Only a
 * boolean `inStock` derived field is exposed instead.
 *
 * HUR-55 AC2 (supplier data is admin-only, never public): `suppliers`
 * (ProductSupplier[]) is explicitly stripped here too, even though the
 * current `ProductWithRelations`/`ProductListItem` types never `include`
 * it — this is a defense-in-depth redaction so a future call site that
 * accidentally adds `include: { suppliers: true }` upstream still can't
 * leak supplier data through this serialization boundary. Mirrors the
 * `stockQuantity` redaction pattern established by HUB-25.
 */

import type { ProductListItem, ProductWithRelations } from "@/types/database";

type PublicVariant<V extends { stockQuantity: number }> = Omit<V, "stockQuantity"> & {
  inStock: boolean;
};

export type PublicProductListItem = Omit<ProductListItem, "stockQuantity" | "suppliers"> & {
  inStock: boolean;
};

export type PublicProductWithRelations = Omit<
  ProductWithRelations,
  "stockQuantity" | "variants" | "suppliers"
> & {
  inStock: boolean;
  variants: PublicVariant<ProductWithRelations["variants"][number]>[];
};

function redactVariants<V extends { stockQuantity: number }>(variants: V[]): PublicVariant<V>[] {
  return variants.map((v) => {
    const { stockQuantity, ...rest } = v;
    return { ...rest, inStock: stockQuantity > 0 };
  });
}

// Overload order matters: TypeScript picks the first signature a call's
// argument type is assignable to, not the "best" match. `ProductWithRelations`
// is structurally assignable to `ProductListItem` (it's a strict superset —
// extra `specs`/`variants` fields don't fail a non-literal assignment check),
// so the more specific `ProductWithRelations` overload must come first or
// full-product callers would silently get the listing-card return type.
/** Strip `stockQuantity` from a full product (and each variant), replacing it with `inStock`. */
export function toPublicProduct(product: ProductWithRelations): PublicProductWithRelations;
/** Strip `stockQuantity` from a listing-card product, replacing it with `inStock`. */
export function toPublicProduct(product: ProductListItem): PublicProductListItem;
export function toPublicProduct(
  product: ProductListItem | ProductWithRelations
): PublicProductListItem | PublicProductWithRelations {
  const { stockQuantity, ...rest } = product;
  const inStock = stockQuantity > 0;

  // HUR-55 AC2 defense-in-depth: strip `suppliers` at runtime even though
  // the static input type never declares it — protects against a future
  // upstream `include: { suppliers: true }` accidentally reaching this
  // function. Never assume "the type doesn't have it" means "the runtime
  // object doesn't have it" at a serialization boundary. Uses a plain
  // object cast (not an `in`-narrowing `if`) so it can't affect the
  // control-flow type of `rest` below.
  const restRecord = rest as Record<string, unknown>;
  if ("suppliers" in restRecord) {
    delete restRecord.suppliers;
  }

  if ("variants" in rest) {
    return { ...rest, inStock, variants: redactVariants(rest.variants) };
  }
  return { ...rest, inStock };
}

/** Map an array of listing-card products through `toPublicProduct()`. */
export function toPublicProducts(products: ProductListItem[]): PublicProductListItem[] {
  return products.map((p) => toPublicProduct(p));
}
