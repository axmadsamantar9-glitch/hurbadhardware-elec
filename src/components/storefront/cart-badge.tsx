"use client";

/**
 * Header cart-count badge (HUR-190, U9 / PRD R8). Links to /:locale/cart.
 *
 * Guest count comes from `useCartStore` (localStorage); authenticated count
 * comes from GET /api/cart (re-fetched on mount and whenever auth status
 * changes). Guarded with the store's own `hasHydrated` flag before reading
 * the persisted Zustand store -- `persist` hydrates from localStorage after
 * first mount, so reading it during SSR/first client render would always
 * show 0 and then "pop" to the real count, and worse, could mismatch
 * between server and client HTML. `hasHydrated` flips via the store's
 * `onRehydrateStorage` callback (see cartStore.ts), not a component effect.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCartStore } from "@/store/cartStore";
import { totalCartQuantity } from "@/lib/storefront/cart";

export function CartBadge({ locale, label }: { locale: string; label: string }) {
  const { status } = useSession();
  const guestItems = useCartStore((s) => s.items);
  const hasHydrated = useCartStore((s) => s.hasHydrated);
  const [authCount, setAuthCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/cart")
      .then((res) => (res.ok ? (res.json() as Promise<{ lines: { quantity: number }[] }>) : null))
      .then((data) => {
        if (!cancelled && data) setAuthCount(totalCartQuantity(data.lines));
      })
      .catch(() => {
        /* badge count is best-effort; a failed fetch just shows stale/0 */
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const count = !hasHydrated
    ? 0
    : status === "authenticated"
      ? authCount
      : totalCartQuantity(guestItems);

  return (
    <Link
      href={`/${locale}/cart`}
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted"
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
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.94-4.693 2.436-7.152.083-.415-.235-.798-.66-.798H5.106M7.5 14.25L5.106 5.272M7.5 14.25L5.85 20.4a.75.75 0 00.75.9h9.9a.75.75 0 00.75-.9l-.512-1.65"
        />
      </svg>
      {hasHydrated && count > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
