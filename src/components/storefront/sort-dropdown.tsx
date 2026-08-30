"use client";

/** Sort dropdown (U6): price asc/desc, newest, rating, popularity. */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildFilterHref,
  parseStorefrontSearchParams,
  SORT_OPTIONS,
} from "@/lib/storefront/query-state";
import type { ProductSort } from "@/lib/api/products";

interface SortDropdownProps {
  /** Translated "Sort by" aria-label. */
  label: string;
  /** Translated option labels, keyed by SORT_OPTIONS[].labelKey. */
  optionLabels: Record<string, string>;
}

export function SortDropdown({ label, optionLabels }: SortDropdownProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = parseStorefrontSearchParams(searchParams);

  return (
    <select
      value={state.sort}
      aria-label={label}
      onChange={(event) => {
        const href = buildFilterHref(pathname, state, {
          sort: event.target.value as ProductSort,
        });
        router.push(href, { scroll: false });
      }}
      className="h-10 rounded-lg border border-input-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {optionLabels[option.labelKey] ?? option.labelKey}
        </option>
      ))}
    </select>
  );
}
