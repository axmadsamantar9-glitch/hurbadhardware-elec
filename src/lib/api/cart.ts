/**
 * Authenticated (DB-backed) cart data layer (HUR-190, U9 / PRD R8, KTD10).
 *
 * Every function here takes a `userId` sourced from the server-side session
 * (never a client-supplied value -- see src/app/api/cart/route.ts for the
 * trust-boundary enforcement, matching src/lib/api/wishlist.ts's precedent)
 * and scopes every query to that user's cart.
 *
 * Concurrency: `Cart.userId` has no DB unique constraint (see
 * prisma/schema.prisma -- `Cart.sessionId` supports guest carts too, so a
 * unique constraint on `userId` alone isn't part of the schema), so
 * `findOrCreateCart()` and any cart-item-line mutation take a Postgres
 * advisory transaction lock keyed by userId/cartId to serialize concurrent
 * requests for the same cart -- otherwise two concurrent "add to cart"
 * requests (e.g. two open tabs) could both pass a `findFirst` check and each
 * create a duplicate Cart row, or each create a duplicate CartItem line for
 * the same product. This mirrors the raw-SQL-inside-`$transaction` pattern
 * established by `adjustStock()` in src/lib/inventory.ts.
 */

import { db } from "@/lib/db";
import { isValidQuantity, mergeCartLines, type CartLine } from "@/lib/storefront/cart";
import { priceCartLines, type PricedCart } from "@/lib/api/cart-pricing";

export type CartError = "product_not_found" | "invalid_quantity" | "not_found";

/**
 * Find the user's cart, creating one if none exists. Race-safe: takes a
 * Postgres advisory lock (`pg_advisory_xact_lock`, scoped to this
 * transaction and released automatically at commit/rollback) keyed by
 * `userId` before the find-or-create check, so two concurrent callers for a
 * brand-new user's first cart can never both create a Cart row.
 */
export async function findOrCreateCart(userId: string): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const existing = await tx.cart.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) return existing;
    return tx.cart.create({ data: { userId }, select: { id: true } });
  });
}

/**
 * Fetch the user's cart lines re-priced against live product/variant data
 * (Iron Rule #1). Returns an empty cart (no Cart row created) if the user
 * has never added anything -- GET requests should never have the side effect
 * of creating a Cart row.
 */
export async function getCartLinesPriced(userId: string): Promise<PricedCart> {
  const cart = await db.cart.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (!cart) return { lines: [], subtotalUsd: 0 };

  const items = await db.cartItem.findMany({ where: { cartId: cart.id } });
  const rawLines = items.map((i) => ({
    cartItemId: i.id,
    productId: i.productId,
    variantId: i.variantId,
    quantity: i.quantity,
  }));

  return priceCartLines(rawLines);
}

/**
 * Add a product (optionally a specific variant) to a user's cart. Rejects an
 * invalid/inactive product or variant id, or a non-positive/non-integer
 * quantity (HUR-190 scope item 4) -- never even reads a client-submitted
 * price field (the input type has none).
 *
 * Idempotent-by-increment: if a line for this exact product+variant already
 * exists, its quantity is incremented rather than a duplicate line being
 * created (scope item: "cart line add-when-exists should increment quantity
 * via a safe DB operation, not check-then-insert"). Serialized per-cart via
 * the same advisory-lock pattern as `findOrCreateCart()`.
 */
export async function addCartItem(
  userId: string,
  input: { productId: string; variantId?: string | null; quantity: number }
): Promise<{ ok: true } | { ok: false; error: CartError }> {
  const variantId = input.variantId ?? null;

  if (!isValidQuantity(input.quantity)) {
    return { ok: false, error: "invalid_quantity" };
  }

  const product = await db.product.findUnique({
    where: { id: input.productId },
    include: { variants: variantId ? { where: { id: variantId } } : false },
  });

  if (!product || !product.isActive) {
    return { ok: false, error: "product_not_found" };
  }

  if (variantId) {
    const variant = product.variants[0];
    if (!variant || !variant.isActive || variant.productId !== product.id) {
      return { ok: false, error: "product_not_found" };
    }
  }

  const cart = await findOrCreateCart(userId);

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cart.id}))`;
    const existing = await tx.cartItem.findFirst({
      where: { cartId: cart.id, productId: input.productId, variantId },
    });
    if (existing) {
      await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + input.quantity },
      });
    } else {
      await tx.cartItem.create({
        data: { cartId: cart.id, productId: input.productId, variantId, quantity: input.quantity },
      });
    }
  });

  return { ok: true };
}

/**
 * Set a cart line's quantity to an exact value (not an increment) -- used by
 * the cart page's quantity stepper. Scoped strictly to the calling user: the
 * cart item is only mutated if it belongs to a cart owned by `userId`, so
 * this can never touch another user's cart item regardless of what
 * `cartItemId` a client sends.
 */
export async function updateCartItemQuantity(
  userId: string,
  cartItemId: string,
  quantity: number
): Promise<{ ok: true } | { ok: false; error: CartError }> {
  if (!isValidQuantity(quantity)) {
    return { ok: false, error: "invalid_quantity" };
  }

  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: { select: { userId: true } } },
  });

  if (!item || item.cart.userId !== userId) {
    return { ok: false, error: "not_found" };
  }

  await db.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
  return { ok: true };
}

/**
 * Remove a single cart line. Ownership-scoped the same way as
 * `updateCartItemQuantity()`. Idempotent: removing an item that doesn't
 * exist (or isn't this user's) is a no-op, not an error -- matches the
 * wishlist precedent for delete-style mutations.
 */
export async function removeCartItem(userId: string, cartItemId: string): Promise<void> {
  const item = await db.cartItem.findUnique({
    where: { id: cartItemId },
    include: { cart: { select: { userId: true } } },
  });
  if (!item || item.cart.userId !== userId) return;
  await db.cartItem.delete({ where: { id: cartItemId } });
}

/**
 * Merge a guest (localStorage) cart's lines into the user's DB cart on login
 * (HUR-190 scope item 5). Lines referencing a deleted/inactive product or an
 * invalid variant are dropped rather than trusted -- the guest cart is
 * client-supplied data. Quantities are summed for lines that already exist
 * in the DB cart (see `mergeCartLines()`). Serialized via the same
 * advisory-lock pattern as `addCartItem()` so a merge racing a concurrent
 * add-to-cart can't produce duplicate lines.
 */
export async function mergeGuestCartIntoDb(
  userId: string,
  guestLines: readonly CartLine[]
): Promise<void> {
  const candidateLines = guestLines.filter(
    (l) => typeof l.productId === "string" && l.productId.length > 0 && isValidQuantity(l.quantity)
  );
  if (candidateLines.length === 0) return;

  // Validate against live product/variant data before merging -- never
  // trust a client-supplied cart snapshot as-is.
  const productIds = [...new Set(candidateLines.map((l) => l.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: { variants: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const validLines: CartLine[] = [];
  for (const line of candidateLines) {
    const product = productMap.get(line.productId);
    if (!product) continue;
    if (line.variantId) {
      const variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant || !variant.isActive) continue;
    }
    validLines.push(line);
  }
  if (validLines.length === 0) return;

  const cart = await findOrCreateCart(userId);

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cart.id}))`;
    const dbItems = await tx.cartItem.findMany({ where: { cartId: cart.id } });
    const dbLines: CartLine[] = dbItems.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
    }));

    const merged = mergeCartLines(dbLines, validLines);

    for (const line of merged) {
      const existing = dbItems.find(
        (i) => i.productId === line.productId && (i.variantId ?? null) === line.variantId
      );
      if (existing) {
        if (existing.quantity !== line.quantity) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity: line.quantity },
          });
        }
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
          },
        });
      }
    }
  });
}
