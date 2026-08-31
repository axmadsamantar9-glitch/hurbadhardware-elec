/**
 * Pure logic for the shopping cart (HUR-190, U9 / PRD R8, KTD10).
 *
 * Kept hook-free/DOM-free/DB-free (see HUR-16 learnings: this repo has no
 * JSX/component-render test infra) so the quantity-validation and
 * guest-cart-merge branching is covered by plain vitest unit tests, with
 * `src/store/cartStore.ts` (client) and `src/lib/api/cart.ts` (DB layer)
 * staying thin wrappers around this.
 */

/** A single cart line, keyed by product + optional variant. */
export interface CartLine {
  productId: string;
  /** `null` for a line with no variant selected (product-level line). */
  variantId: string | null;
  quantity: number;
}

/**
 * Whether `value` is a valid cart-line quantity: a finite, positive integer.
 * Guards with `Number.isFinite()` (not just `Number.isNaN()`) per the
 * HUR-187 numeric-parsing lesson — `Infinity`/`-Infinity` pass `isNaN()` but
 * must never be accepted as a quantity.
 */
export function isValidQuantity(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0
  );
}

/** Stable string key for grouping/matching cart lines by product+variant. */
export function cartLineKey(line: Pick<CartLine, "productId" | "variantId">): string {
  return `${line.productId}::${line.variantId ?? ""}`;
}

/**
 * Merge a guest (localStorage) cart's lines into a DB cart's existing lines,
 * per HUR-190 scope item 5: "sum quantities for lines that already exist in
 * the DB cart". Pure — returns the full desired end-state line list; the
 * caller (src/lib/api/cart.ts) is responsible for diffing this against the
 * DB's actual rows to decide which to `update` vs `create`.
 *
 * Invalid guest lines (non-positive/non-integer quantity, or a missing
 * productId) are silently dropped rather than throwing — a malformed/tampered
 * localStorage payload must never break login.
 */
export function mergeCartLines(
  dbLines: readonly CartLine[],
  guestLines: readonly CartLine[]
): CartLine[] {
  const map = new Map<string, CartLine>();

  for (const line of dbLines) {
    map.set(cartLineKey(line), { ...line });
  }

  for (const line of guestLines) {
    if (!line.productId || !isValidQuantity(line.quantity)) continue;
    const normalized: CartLine = { ...line, variantId: line.variantId ?? null };
    const key = cartLineKey(normalized);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += normalized.quantity;
    } else {
      map.set(key, normalized);
    }
  }

  return [...map.values()];
}

/** Round a USD amount to 2 decimal places, avoiding float artifacts like 19.999999999998. */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Sum of `quantity` across all lines — used for cart-badge counts (guest and authenticated). */
export function totalCartQuantity(lines: readonly Pick<CartLine, "quantity">[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}
