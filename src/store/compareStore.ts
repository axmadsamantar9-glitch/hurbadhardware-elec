/**
 * Client-side product-comparison selection state (HUR-26, PRD R5).
 *
 * Mirrors src/store/wishlistStore.ts's architecture (Zustand, KTD10) but is
 * deliberately simpler and NOT persisted anywhere (no schema, no DB, no
 * localStorage) — see the doc comment in src/lib/storefront/compare.ts for
 * the full rationale, including why this design sidesteps the HUB-35
 * hydration-mismatch lesson rather than needing to re-solve it: the store
 * always starts empty on both server-rendered first paint and the client,
 * so there is no external truth for any consumer to be "wrong" about on
 * first paint. The one place that needs first-paint-correct data (the
 * comparison table page) reads the `ids` URL query param server-side
 * instead of this store — see src/app/[locale]/products/compare/page.tsx.
 *
 * All the actual add/remove/cap-at-3 branching logic lives in the pure,
 * unit-tested helpers in src/lib/storefront/compare.ts; this store is only
 * a thin reactive wrapper so `CompareButton` instances across the page
 * (product cards, PDP) stay in sync with each other.
 */

import { create } from "zustand";
import {
  MAX_COMPARE_PRODUCTS,
  toggleCompareId,
  removeCompareId,
  clearCompareIds,
  type CompareToggleStatus,
} from "@/lib/storefront/compare";

interface CompareState {
  /** Selected product ids, in selection order. Never longer than MAX_COMPARE_PRODUCTS. */
  ids: string[];
  /** Add/remove a product id; rejects a 4th distinct selection (see toggleCompareId doc comment). */
  toggle: (productId: string) => CompareToggleStatus;
  /** Remove a single product id without touching the rest. No-op if not present. */
  remove: (productId: string) => void;
  /** Clear the entire comparison set. */
  clear: () => void;
  has: (productId: string) => boolean;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  ids: [],
  toggle: (productId) => {
    const result = toggleCompareId(get().ids, productId);
    set({ ids: result.ids });
    return result.status;
  },
  remove: (productId) => set((state) => ({ ids: removeCompareId(state.ids, productId) })),
  clear: () => set({ ids: clearCompareIds() }),
  has: (productId) => get().ids.includes(productId),
}));

export { MAX_COMPARE_PRODUCTS };
