/**
 * Pure logic for product comparison (HUR-26, PRD R5): "Customers compare up
 * to 3 products side-by-side on a shared specification table."
 *
 * Kept hook-free/DOM-free (see HUR-16 learnings: this repo has no
 * JSX/component-render test infra) so every branch here — the cap-at-3
 * policy, add/remove/toggle, and the cross-product spec-row alignment — is
 * covered by plain vitest unit tests, with `src/store/compareStore.ts` and
 * `src/components/storefront/compare-button.tsx` staying thin wrappers.
 *
 * Persistence: comparison selection is deliberately NOT persisted anywhere
 * (no schema change, no DB, no localStorage/sessionStorage) — it lives only
 * in the in-memory Zustand store for the current browser tab/session and
 * resets on a full page reload. This is a deliberate scope choice (ticket:
 * "non-persisted (session/local only)") that also sidesteps the HUB-35
 * hydration-mismatch class of bug entirely: since the store always starts
 * empty on both the server-rendered first paint and the client, there is no
 * external truth to hydrate from and therefore no "wrong on first paint"
 * window. The one page that *does* need first-paint-correct state (the
 * comparison table itself) gets it from the URL's `ids` query param via
 * `parseCompareIdsParam()`, resolved server-side, not from this client
 * store — see src/app/[locale]/products/compare/page.tsx.
 */

import type { SpecSheetRow } from "@/lib/storefront/spec-sheet";

/** Per PRD R5: compare up to 3 products side-by-side. */
export const MAX_COMPARE_PRODUCTS = 3;

export type CompareToggleStatus = "added" | "removed" | "rejected_full";

export interface CompareToggleResult {
  ids: string[];
  status: CompareToggleStatus;
}

/**
 * Toggle a single product id in/out of the comparison set.
 *
 * Policy for a 4th distinct selection attempt while already at the cap
 * (documented per the ticket's requirement to handle it explicitly rather
 * than silently allow or silently ignore it): **reject**, leaving the
 * existing 3 selections untouched and returning `"rejected_full"` so the
 * caller can surface an explicit message ("You can compare up to 3
 * products — remove one first"). Replace-oldest was considered but
 * rejected: silently evicting a product the user deliberately chose is a
 * worse surprise than a rejected click, and a rejection is trivially
 * recoverable (remove one, try again).
 */
export function toggleCompareId(
  current: readonly string[],
  id: string,
  max: number = MAX_COMPARE_PRODUCTS
): CompareToggleResult {
  if (current.includes(id)) {
    return { ids: current.filter((existing) => existing !== id), status: "removed" };
  }
  if (current.length >= max) {
    return { ids: [...current], status: "rejected_full" };
  }
  return { ids: [...current, id], status: "added" };
}

/** Remove a single product id from the comparison set. No-op (idempotent) if not present. */
export function removeCompareId(current: readonly string[], id: string): string[] {
  return current.filter((existing) => existing !== id);
}

/** Clear the entire comparison set. */
export function clearCompareIds(): string[] {
  return [];
}

/**
 * Parse the `?ids=a,b,c` query param into a deduplicated, capped list of
 * product ids. Never throws — malformed input (empty segments, whitespace,
 * duplicates, more than `max` ids) degrades gracefully rather than erroring,
 * matching the convention in src/lib/storefront/query-state.ts.
 */
export function parseCompareIdsParam(
  param: string | null | undefined,
  max: number = MAX_COMPARE_PRODUCTS
): string[] {
  if (!param) return [];
  const ids = param
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const deduped = [...new Set(ids)];
  return deduped.slice(0, max);
}

/** Build a locale-prefixed href for the comparison page for a given id set. */
export function buildCompareHref(locale: string, ids: readonly string[]): string {
  if (ids.length === 0) return `/${locale}/products/compare`;
  return `/${locale}/products/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}

/** One aligned row of the comparison table: a shared spec key plus one value slot per product (column). */
export interface ComparisonRow {
  keyEn: string;
  keySo: string;
  /** `valuesEn[i]` / `valuesSo[i]` correspond to `productSpecSheets[i]`; `undefined` when that product has no matching spec. */
  valuesEn: (string | undefined)[];
  valuesSo: (string | undefined)[];
}

/**
 * Merge each product's already-template-ordered spec sheet (see
 * `buildSpecSheet()`) into a single shared row list, aligned by spec key
 * (case-insensitive `keyEn` match) so the same row represents the same
 * physical spec across every column, even when only some products carry it.
 *
 * Row order: first-seen order walking products left-to-right, then each
 * product's own (already template-ordered) spec order — so if products
 * share a category, rows come out in that category's template order; if
 * they don't, the first product's ordering wins for the keys it has, with
 * any keys unique to later products appended after.
 */
export function buildComparisonRows<T extends SpecSheetRow>(
  productSpecSheets: readonly T[][]
): ComparisonRow[] {
  const order: string[] = [];
  const display = new Map<string, { keyEn: string; keySo: string }>();
  const byProduct: Map<string, T>[] = productSpecSheets.map(() => new Map());

  productSpecSheets.forEach((specs, productIndex) => {
    for (const spec of specs) {
      const key = spec.keyEn.toLowerCase();
      if (!display.has(key)) {
        display.set(key, { keyEn: spec.keyEn, keySo: spec.keySo });
        order.push(key);
      }
      byProduct[productIndex].set(key, spec);
    }
  });

  return order.map((key) => {
    const { keyEn, keySo } = display.get(key)!;
    return {
      keyEn,
      keySo,
      valuesEn: byProduct.map((m) => m.get(key)?.valueEn),
      valuesSo: byProduct.map((m) => m.get(key)?.valueSo),
    };
  });
}
