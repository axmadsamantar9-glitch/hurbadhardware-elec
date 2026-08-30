/**
 * Wishlist data layer (HUB-35, U9 / PRD R9).
 *
 * Authenticated-only: every function here takes a `userId` sourced from the
 * server-side session (never a client-supplied value — see the API route in
 * src/app/api/wishlist/route.ts for the trust-boundary enforcement) and
 * scopes every query to that user. There is no function here that can read
 * or mutate another user's wishlist rows.
 */

import { db } from "@/lib/db";
import type { ProductListItem } from "@/types/database";

/** Shared `include` so listing queries match `ProductListItem`'s shape. */
const PRODUCT_LIST_INCLUDE = {
  images: true,
  category: true,
  brand: true,
} as const;

export type WishlistError = "product_not_found";

/**
 * Fetch a user's wishlisted products (newest-added first), shaped as
 * `ProductListItem[]` so callers can pass them straight through
 * `toPublicProducts()` (Iron Rule #6) and reuse `<ProductCard />`.
 */
export async function getWishlistProducts(userId: string): Promise<ProductListItem[]> {
  const rows = await db.wishlist.findMany({
    where: { userId },
    include: { product: { include: PRODUCT_LIST_INCLUDE } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => r.product);
}

/**
 * Cheap single-product check for hydrating a `WishlistButton`'s initial
 * state on first paint (e.g. the PDP) without fetching the user's entire
 * wishlist. Relies on the `@@unique([userId, productId])` constraint, so
 * this is a single indexed lookup, not a table scan.
 */
export async function isProductWishlisted(userId: string, productId: string): Promise<boolean> {
  const row = await db.wishlist.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { userId: true },
  });
  return row !== null;
}

/**
 * Add a product to a user's wishlist. Idempotent: adding an
 * already-wishlisted product is a no-op success, not an error (matches the
 * "toggle" UX the button implements — a double-click / retry must never
 * surface a 409 to the user).
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, error }` if the
 * product doesn't exist (or is inactive) — checked explicitly rather than
 * relying on the FK constraint so the API route can return a clean 404
 * instead of a raw Prisma error.
 */
export async function addToWishlist(
  userId: string,
  productId: string
): Promise<{ ok: true } | { ok: false; error: WishlistError }> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, isActive: true },
  });

  if (!product || !product.isActive) {
    return { ok: false, error: "product_not_found" };
  }

  // Upsert on the (userId, productId) unique constraint — makes concurrent
  // double-adds and refetch-after-add both safe/idempotent instead of
  // relying on the caller to catch a P2002 unique-violation.
  await db.wishlist.upsert({
    where: { userId_productId: { userId, productId } },
    update: {},
    create: { userId, productId },
  });

  return { ok: true };
}

/**
 * Remove a product from a user's wishlist. Idempotent: removing a product
 * that isn't wishlisted (or doesn't exist) is a no-op success.
 */
export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db.wishlist.deleteMany({ where: { userId, productId } });
}
