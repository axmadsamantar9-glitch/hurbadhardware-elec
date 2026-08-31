/**
 * Server-authoritative cart-line pricing (HUR-190, U9/U11 / PRD R8, Iron
 * Rule #1: "Client Input Never Trusted for Price, Stock, Tax, Shipping").
 *
 * Given a raw list of {productId, variantId, quantity} lines (from either a
 * DB-backed authenticated cart or a client-submitted guest-cart snapshot),
 * this re-fetches the current product/variant price and stock straight from
 * the DB and computes each line's total. It NEVER accepts or trusts a
 * caller-supplied price — the `RawCartLine` type doesn't even have a price
 * field to accidentally read.
 *
 * Used by both GET /api/cart (authenticated, DB-backed lines) and POST
 * /api/cart/price (public, used to reprice a guest's localStorage cart for
 * display) so both code paths share one pricing implementation.
 */

import { db } from "@/lib/db";
import { sortProductImages } from "@/lib/storefront/images";
import { roundMoney } from "@/lib/storefront/cart";

export interface RawCartLine {
  /** Present for DB-backed cart lines; absent for a guest-cart line that has no DB row. */
  cartItemId?: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}

export interface PricedCartLine extends RawCartLine {
  slug: string;
  nameEn: string;
  nameSo: string;
  image: string | null;
  unitPriceUsd: number;
  lineTotalUsd: number;
  /** Product (and variant, if any) is active and has stock > 0. */
  inStock: boolean;
  /** Requested quantity exceeds currently available stock (still shown, not silently clamped — the cart UI surfaces this). */
  insufficientStock: boolean;
  /** False when the underlying product has been deactivated since the line was added. */
  productActive: boolean;
}

export interface PricedCart {
  lines: PricedCartLine[];
  subtotalUsd: number;
}

/**
 * Re-price a set of raw cart lines against live DB data. Lines referencing a
 * deleted product, or a variantId that no longer belongs to that product,
 * are silently dropped (matches `getProductsByIds()`'s "invalid/missing
 * refs are ignored gracefully" convention elsewhere in this codebase) —
 * callers that need to reconcile dropped lines against a DB cart (e.g. to
 * clean up orphaned CartItem rows) should diff the input against the
 * output themselves.
 */
export async function priceCartLines(lines: RawCartLine[]): Promise<PricedCart> {
  if (lines.length === 0) return { lines: [], subtotalUsd: 0 };

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    include: { images: true, variants: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const priced: PricedCartLine[] = [];
  let subtotalUsd = 0;

  for (const line of lines) {
    const product = productMap.get(line.productId);
    if (!product) continue;

    const variant = line.variantId
      ? product.variants.find((v) => v.id === line.variantId)
      : undefined;
    if (line.variantId && !variant) continue;

    const unitPriceUsd = (variant ? variant.priceUsd : product.basePriceUsd).toNumber();
    const stockQuantity = variant ? variant.stockQuantity : product.stockQuantity;
    const active = variant ? product.isActive && variant.isActive : product.isActive;
    const inStock = active && stockQuantity > 0;
    const insufficientStock = active && line.quantity > stockQuantity;
    const lineTotalUsd = roundMoney(unitPriceUsd * line.quantity);
    subtotalUsd += lineTotalUsd;

    const primaryImage = sortProductImages(product.images)[0];

    priced.push({
      ...line,
      slug: product.slug,
      nameEn: product.nameEn,
      nameSo: product.nameSo,
      image: primaryImage?.url ?? null,
      unitPriceUsd,
      lineTotalUsd,
      inStock,
      insufficientStock,
      productActive: product.isActive,
    });
  }

  return { lines: priced, subtotalUsd: roundMoney(subtotalUsd) };
}
