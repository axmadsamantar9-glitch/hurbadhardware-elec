/**
 * Pure URL <-> filter-state helpers for the storefront search/filter/sort UI
 * (U6). Kept hook-free and DOM-free so all branching logic here is
 * unit-testable directly (see HUR-16 learnings: this repo has no
 * JSX/component-render test infra — "use client" components must stay thin
 * wrappers around pure functions like these).
 *
 * URL query param names are the public contract for shareable/bookmarkable
 * filtered views:
 *   - q          -> free-text search (maps to getProducts()'s `search` field)
 *   - category   -> maps 1:1 to GetProductsQuery.category (slug or name)
 *   - brand      -> maps 1:1 to GetProductsQuery.brand
 *   - priceMin   -> maps 1:1 to GetProductsQuery.priceMin
 *   - priceMax   -> maps 1:1 to GetProductsQuery.priceMax
 *   - inStock    -> "true" maps to GetProductsQuery.inStock = true
 *   - sort       -> maps 1:1 to GetProductsQuery.sort (one of PRODUCT_SORTS)
 *   - page       -> 1-based page number
 */

import { PRODUCT_SORTS, type ProductSort, type GetProductsQuery } from "@/lib/api/products";

/** Normalized, always-defined filter/search/sort state derived from the URL. */
export interface StorefrontQueryState {
  q: string;
  category: string;
  brand: string;
  /** Kept as raw strings (form-input friendly); parsed to numbers in `toGetProductsQuery`. */
  priceMin: string;
  priceMax: string;
  inStock: boolean;
  sort: ProductSort;
  page: number;
}

export const DEFAULT_SORT: ProductSort = "newest";

const DEFAULT_STATE: StorefrontQueryState = {
  q: "",
  category: "",
  brand: "",
  priceMin: "",
  priceMax: "",
  inStock: false,
  sort: DEFAULT_SORT,
  page: 1,
};

function readParam(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined;
  }
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isProductSort(value: string | undefined): value is ProductSort {
  return value !== undefined && (PRODUCT_SORTS as readonly string[]).includes(value);
}

/**
 * Parse a `URLSearchParams` (client) or a plain searchParams record (Next.js
 * Server Component `searchParams` prop) into normalized filter state. Never
 * throws — malformed/unknown values fall back to the default for that field.
 */
export function parseStorefrontSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>
): StorefrontQueryState {
  const q = readParam(params, "q") ?? DEFAULT_STATE.q;
  const category = readParam(params, "category") ?? DEFAULT_STATE.category;
  const brand = readParam(params, "brand") ?? DEFAULT_STATE.brand;
  const priceMin = readParam(params, "priceMin") ?? DEFAULT_STATE.priceMin;
  const priceMax = readParam(params, "priceMax") ?? DEFAULT_STATE.priceMax;
  const inStock = readParam(params, "inStock") === "true";
  const sortRaw = readParam(params, "sort");
  const sort = isProductSort(sortRaw) ? sortRaw : DEFAULT_SORT;
  const pageRaw = readParam(params, "page");
  const parsedPage = pageRaw !== undefined ? Number.parseInt(pageRaw, 10) : NaN;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_STATE.page;

  return { q, category, brand, priceMin, priceMax, inStock, sort, page };
}

/**
 * Build the `GetProductsQuery` object `getProducts()` expects from
 * normalized UI state. `categoryOverride` lets category pages pin the
 * category to the route's `[slug]` regardless of what (if anything) is in
 * `state.category` — the filter sidebar doesn't render a category selector
 * on category pages, but this keeps the mapping correct even if a stray
 * `category` param is present in the URL.
 */
export function toGetProductsQuery(
  state: StorefrontQueryState,
  opts: { limit: number; categoryOverride?: string }
): GetProductsQuery {
  const priceMinNum = state.priceMin.trim() !== "" ? Number(state.priceMin) : undefined;
  const priceMaxNum = state.priceMax.trim() !== "" ? Number(state.priceMax) : undefined;

  return {
    page: state.page,
    limit: opts.limit,
    search: state.q.trim(),
    category: opts.categoryOverride ?? state.category,
    brand: state.brand,
    priceMin: priceMinNum !== undefined && Number.isFinite(priceMinNum) ? priceMinNum : undefined,
    priceMax: priceMaxNum !== undefined && Number.isFinite(priceMaxNum) ? priceMaxNum : undefined,
    inStock: state.inStock ? true : undefined,
    sort: state.sort,
  };
}

/**
 * Merge `patch` into `current` and serialize to a query string, omitting any
 * field that's at its default (keeps shareable URLs minimal/clean). Changing
 * any filter/search/sort field resets `page` back to 1 unless the patch
 * itself explicitly sets `page` (i.e. pagination links pass `{ page }` and
 * nothing else).
 */
export function buildFilterHref(
  pathname: string,
  current: StorefrontQueryState,
  patch: Partial<StorefrontQueryState>
): string {
  const resetPage = !("page" in patch);
  const next: StorefrontQueryState = {
    ...current,
    ...patch,
    page: resetPage ? 1 : (patch.page ?? current.page),
  };

  const search = new URLSearchParams();
  if (next.q.trim() !== "") search.set("q", next.q.trim());
  if (next.category !== "") search.set("category", next.category);
  if (next.brand !== "") search.set("brand", next.brand);
  if (next.priceMin.trim() !== "") search.set("priceMin", next.priceMin.trim());
  if (next.priceMax.trim() !== "") search.set("priceMax", next.priceMax.trim());
  if (next.inStock) search.set("inStock", "true");
  if (next.sort !== DEFAULT_SORT) search.set("sort", next.sort);
  if (next.page > 1) search.set("page", String(next.page));

  const qs = search.toString();
  return qs === "" ? pathname : `${pathname}?${qs}`;
}

/** Whether any search/filter field (not sort/page) is active — used to decide whether to show a "clear filters" action. */
export function hasActiveFilters(state: StorefrontQueryState): boolean {
  return (
    state.q.trim() !== "" ||
    state.category !== "" ||
    state.brand !== "" ||
    state.priceMin.trim() !== "" ||
    state.priceMax.trim() !== "" ||
    state.inStock
  );
}

/** Sort dropdown options, in display order. `labelKey` maps to `storefront.sort.<labelKey>` in messages. */
export const SORT_OPTIONS: Array<{ value: ProductSort; labelKey: string }> = [
  { value: "newest", labelKey: "newest" },
  { value: "price_asc", labelKey: "priceAsc" },
  { value: "price_desc", labelKey: "priceDesc" },
  { value: "rating", labelKey: "rating" },
  { value: "popularity", labelKey: "popularity" },
];
