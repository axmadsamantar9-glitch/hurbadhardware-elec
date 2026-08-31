/**
 * Guest (unauthenticated) shopping cart, persisted to localStorage
 * (HUR-190, U9 / PRD R8, KTD10 -- "guest cart lives entirely client-side").
 *
 * This is the SOURCE OF TRUTH for a guest's cart (unlike
 * src/store/wishlistStore.ts, which is only an optimistic mirror of the DB
 * -- wishlist has no guest mode). No server call happens on guest
 * add/update/remove; this store's `persist` middleware writes straight to
 * localStorage. Prices are NEVER stored here -- only
 * `{ productId, variantId, quantity }` lines. The cart page re-fetches
 * current price/stock live via POST /api/cart/price before rendering any
 * total (Iron Rule #1).
 *
 * Once a guest signs in, `src/components/cart/cart-merge-listener.tsx`
 * reads this store's `items`, POSTs them to /api/cart/merge, and calls
 * `clear()` only after that succeeds -- from then on the DB cart
 * (src/lib/api/cart.ts) is the source of truth and this store is unused
 * until the user signs out again.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isValidQuantity,
  cartLineKey,
  totalCartQuantity,
  type CartLine,
} from "@/lib/storefront/cart";

interface CartState {
  items: CartLine[];
  /**
   * True once `persist` has finished reading localStorage and rehydrating
   * `items`. Components must gate on this (not a local `useEffect` +
   * `setState`) before trusting `items` for anything user-visible -- the
   * store's own `onRehydrateStorage` callback below flips it, so reading
   * it is a plain subscription, not a synchronous setState-in-effect.
   */
  hasHydrated: boolean;
  /** Add `quantity` of a product (optionally a variant) -- merges into an existing line if one matches. */
  addItem: (productId: string, variantId: string | null, quantity?: number) => void;
  /** Set a line's quantity to an exact value; removes the line if `quantity <= 0`. */
  updateQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  /** Remove a single line. No-op if it doesn't exist. */
  removeItem: (productId: string, variantId: string | null) => void;
  /** Empty the cart -- called after a successful login-time merge into the DB cart. */
  clear: () => void;
  /** Total quantity across all lines, for the header cart badge. */
  totalQuantity: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      hasHydrated: false,

      addItem: (productId, variantId, quantity = 1) => {
        if (!isValidQuantity(quantity)) return;
        set((state) => {
          const key = cartLineKey({ productId, variantId });
          const existing = state.items.find((i) => cartLineKey(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                cartLineKey(i) === key ? { ...i, quantity: i.quantity + quantity } : i
              ),
            };
          }
          return { items: [...state.items, { productId, variantId, quantity }] };
        });
      },

      updateQuantity: (productId, variantId, quantity) => {
        const key = cartLineKey({ productId, variantId });
        if (quantity <= 0) {
          set((state) => ({ items: state.items.filter((i) => cartLineKey(i) !== key) }));
          return;
        }
        if (!isValidQuantity(quantity)) return;
        set((state) => ({
          items: state.items.map((i) => (cartLineKey(i) === key ? { ...i, quantity } : i)),
        }));
      },

      removeItem: (productId, variantId) => {
        const key = cartLineKey({ productId, variantId });
        set((state) => ({ items: state.items.filter((i) => cartLineKey(i) !== key) }));
      },

      clear: () => set({ items: [] }),

      totalQuantity: () => totalCartQuantity(get().items),
    }),
    {
      name: "hurbad-guest-cart",
      version: 1,
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => () => {
        useCartStore.setState({ hasHydrated: true });
      },
    }
  )
);
