/**
 * Client-side wishlist UI state (HUB-35, U9 / PRD R9, KTD10: Zustand for
 * cart-adjacent ephemeral UI state).
 *
 * This store is ONLY for optimistic/local UI state — "does this product
 * currently show as wishlisted in this browser tab" — so a heart button
 * anywhere on the page (product card, PDP) can render the correct state
 * without prop-drilling and can flip instantly on click before the network
 * round-trip resolves. It is NOT the source of truth: the `Wishlist` DB
 * table (via /api/wishlist) is. Every mutation here is paired with a real
 * authenticated API call in `useWishlistToggle` (see wishlist-button.tsx);
 * this store never substitutes for that write.
 *
 * On auth changes (sign-out, switching accounts) callers must `reset()` this
 * store — it holds no user id and does not scope itself per-user.
 */

import { create } from "zustand";

interface WishlistState {
  /** Product IDs currently known to be wishlisted, for the signed-in user. */
  productIds: Set<string>;
  /** Whether the initial set has been hydrated from the server at least once. */
  hydrated: boolean;
  /** Replace the full set (e.g. after fetching /api/wishlist). */
  setAll: (ids: string[]) => void;
  /** Optimistically mark a product as wishlisted. */
  add: (productId: string) => void;
  /** Optimistically unmark a product as wishlisted. */
  remove: (productId: string) => void;
  has: (productId: string) => boolean;
  /** Clear all state — call on sign-out. */
  reset: () => void;
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  productIds: new Set(),
  hydrated: false,
  setAll: (ids) => set({ productIds: new Set(ids), hydrated: true }),
  add: (productId) =>
    set((state) => {
      const next = new Set(state.productIds);
      next.add(productId);
      return { productIds: next };
    }),
  remove: (productId) =>
    set((state) => {
      const next = new Set(state.productIds);
      next.delete(productId);
      return { productIds: next };
    }),
  has: (productId) => get().productIds.has(productId),
  reset: () => set({ productIds: new Set(), hydrated: false }),
}));
