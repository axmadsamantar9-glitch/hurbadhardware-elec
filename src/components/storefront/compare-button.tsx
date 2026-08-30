"use client";

/**
 * Toggle affordance for adding/removing a product from the in-progress
 * comparison set (HUR-26, PRD R5). Mirrors wishlist-button.tsx's pattern
 * (opt-in slot on ProductCard, absolutely-positioned icon button) but is
 * simpler: no auth gate (comparison is anonymous/session-only) and no
 * server round-trip — it only ever touches the local `useCompareStore`.
 *
 * First-paint correctness: unlike WishlistButton, this component takes no
 * `initial*` prop and derives its checked/pressed state directly from the
 * client-only Zustand store on every render. That is safe here (does NOT
 * repeat HUB-35's first mistake) because the store has no external source
 * of truth to be out of sync with — it always starts empty on both the
 * server-rendered first paint and the client (see the doc comment in
 * src/lib/storefront/compare.ts for the full reasoning). If this component
 * ever gains persistence (e.g. localStorage-backed selection), it would
 * need the same `initial*`-prop hydration treatment WishlistButton uses.
 */

import { useState } from "react";
import { useCompareStore, MAX_COMPARE_PRODUCTS } from "@/store/compareStore";

interface CompareButtonProps {
  productId: string;
  /** Translated labels: accessible name/title text, and a message shown when the set is already full. */
  labels: { add: string; remove: string; full: string };
  className?: string;
}

export function CompareButton({ productId, labels, className }: CompareButtonProps) {
  const inCompare = useCompareStore((s) => s.ids.includes(productId));
  const count = useCompareStore((s) => s.ids.length);
  const toggle = useCompareStore((s) => s.toggle);

  const [rejected, setRejected] = useState(false);

  function handleClick() {
    const status = toggle(productId);
    setRejected(status === "rejected_full");
  }

  const isFull = !inCompare && count >= MAX_COMPARE_PRODUCTS;
  const label = inCompare ? labels.remove : isFull ? labels.full : labels.add;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleClick();
        }}
        aria-pressed={inCompare}
        aria-label={label}
        title={label}
        className={
          className ??
          "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-muted"
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
          aria-hidden="true"
        >
          {inCompare ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          ) : (
            <>
              <rect x="3" y="5" width="7" height="14" rx="1" />
              <rect x="14" y="5" width="7" height="14" rx="1" />
            </>
          )}
        </svg>
      </button>
      {rejected ? (
        <span role="status" className="sr-only">
          {labels.full}
        </span>
      ) : null}
    </>
  );
}
