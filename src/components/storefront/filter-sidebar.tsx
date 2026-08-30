"use client";

/*
 * Filter sidebar (U6): category, brand, price-range (USD), and in-stock
 * filters, all reflected in the URL query string. Desktop: a static sidebar
 * (sm: and up). Mobile (below 640px): collapses into a bottom-sheet drawer
 * triggered by a button, mirroring the CategoryNav disclosure pattern
 * (Escape to close, click-outside to close, focus returns to the trigger --
 * WCAG 2.4.3 / 2.1.2; see docs/standards/accessibility.md).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildFilterHref,
  hasActiveFilters,
  parseStorefrontSearchParams,
  type StorefrontQueryState,
} from "@/lib/storefront/query-state";

export interface FilterOption {
  slug: string;
  name: string;
}

interface FilterSidebarProps {
  categories: FilterOption[];
  brands: FilterOption[];
  showCategoryFilter: boolean;
  labels: {
    filters: string;
    category: string;
    brand: string;
    allCategories: string;
    allBrands: string;
    priceRange: string;
    priceMin: string;
    priceMax: string;
    inStock: string;
    clearFilters: string;
    close: string;
  };
}

export function FilterSidebar({
  categories,
  brands,
  showCategoryFilter,
  labels,
}: FilterSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = parseStorefrontSearchParams(searchParams);

  const [isOpen, setIsOpen] = useState(false);
  const [localPriceMin, setLocalPriceMin] = useState(state.priceMin);
  const [localPriceMax, setLocalPriceMax] = useState(state.priceMax);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keep local price inputs and the mobile drawer's open state in sync with
  // the URL whenever it changes from elsewhere (a filter applied, a "clear
  // filters" action, or browser back/forward). Adjusted during render (not
  // an effect) per React's "you might not need an effect" guidance — mirrors
  // CategoryNav's `lastPathname` pattern.
  const searchKey = searchParams.toString();
  const [lastSearchKey, setLastSearchKey] = useState(searchKey);
  if (searchKey !== lastSearchKey) {
    setLastSearchKey(searchKey);
    setIsOpen(false);
    setLocalPriceMin(state.priceMin);
    setLocalPriceMax(state.priceMax);
  }

  // Plain function (not useCallback-memoized): used by the Close button /
  // onClick handlers below, outside the effect's dependency graph.
  const closeDrawer = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    // Inlined (rather than calling closeDrawer) so this effect's dependency
    // array only needs `isOpen` — closeDrawer is a fresh reference every
    // render since it isn't (and can't cleanly be, given the render-time
    // state adjustment above) useCallback-memoized.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const applyPatch = (patch: Partial<StorefrontQueryState>) => {
    router.push(buildFilterHref(pathname, state, patch), { scroll: false });
  };

  const clearFilters = () => {
    applyPatch({ category: "", brand: "", priceMin: "", priceMax: "", inStock: false, q: "" });
  };

  const active = hasActiveFilters(state);

  const form = (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        applyPatch({ priceMin: localPriceMin, priceMax: localPriceMax });
      }}
    >
      {showCategoryFilter ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filter-category" className="text-sm font-medium text-foreground">
            {labels.category}
          </label>
          <select
            id="filter-category"
            value={state.category}
            onChange={(event) => applyPatch({ category: event.target.value })}
            className="h-10 rounded-lg border border-input-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <option value="">{labels.allCategories}</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="filter-brand" className="text-sm font-medium text-foreground">
          {labels.brand}
        </label>
        <select
          id="filter-brand"
          value={state.brand}
          onChange={(event) => applyPatch({ brand: event.target.value })}
          className="h-10 rounded-lg border border-input-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <option value="">{labels.allBrands}</option>
          {brands.map((brand) => (
            <option key={brand.slug} value={brand.name}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-foreground">{labels.priceRange}</legend>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={localPriceMin}
            onChange={(event) => setLocalPriceMin(event.target.value)}
            onBlur={() => applyPatch({ priceMin: localPriceMin })}
            placeholder={labels.priceMin}
            aria-label={labels.priceMin}
            className="w-full"
          />
          <span className="text-muted-foreground" aria-hidden="true">
            -
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={localPriceMax}
            onChange={(event) => setLocalPriceMax(event.target.value)}
            onBlur={() => applyPatch({ priceMax: localPriceMax })}
            placeholder={labels.priceMax}
            aria-label={labels.priceMax}
            className="w-full"
          />
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={state.inStock}
          onChange={(event) => applyPatch({ inStock: event.target.checked })}
          className="h-4 w-4 rounded border-input-border"
        />
        {labels.inStock}
      </label>

      {active ? (
        <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
          {labels.clearFilters}
        </Button>
      ) : null}
    </form>
  );

  return (
    <div>
      <div className="sm:hidden">
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
        >
          {labels.filters}
          {active ? <span aria-hidden="true">*</span> : null}
        </Button>

        {isOpen ? (
          <>
            <div className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={labels.filters}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background p-4 shadow-lg"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{labels.filters}</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => closeDrawer(true)}
                  aria-label={labels.close}
                >
                  {labels.close}
                </Button>
              </div>
              {form}
            </div>
          </>
        ) : null}
      </div>

      <aside className="hidden w-56 shrink-0 sm:block" aria-label={labels.filters}>
        {form}
      </aside>
    </div>
  );
}
