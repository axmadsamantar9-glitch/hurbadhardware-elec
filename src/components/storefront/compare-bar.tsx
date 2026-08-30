"use client";

/**
 * Small persistent bar showing how many products are currently selected for
 * comparison, with a link to the comparison page and a "clear all" action
 * (HUR-26). Renders nothing when the selection is empty. Purely a thin view
 * over `useCompareStore` — all branching logic (cap, add/remove) lives in
 * src/lib/storefront/compare.ts.
 */

import Link from "next/link";
import { useCompareStore } from "@/store/compareStore";
import { buildCompareHref } from "@/lib/storefront/compare";

interface CompareBarProps {
  locale: string;
  /** `{count}` is replaced with the number of currently-selected products. */
  viewLabel: string;
  clearLabel: string;
}

export function CompareBar({ locale, viewLabel, clearLabel }: CompareBarProps) {
  const ids = useCompareStore((s) => s.ids);
  const clear = useCompareStore((s) => s.clear);

  if (ids.length === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 shadow-md">
      <Link
        href={buildCompareHref(locale, ids)}
        className="text-sm font-medium text-primary-text hover:underline"
      >
        {viewLabel.replace("{count}", String(ids.length))}
      </Link>
      <button
        type="button"
        onClick={() => clear()}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {clearLabel}
      </button>
    </div>
  );
}
