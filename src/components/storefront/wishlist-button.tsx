"use client";

/**
 * Heart/bookmark toggle for adding or removing a product from the signed-in
 * user's wishlist (HUB-35, U9 / PRD R9). Used on product cards and the PDP.
 *
 * Unauthenticated users are redirected to sign-in (preserving locale and a
 * `callbackUrl` back to the current page) rather than silently failing —
 * mirrors the redirect pattern in src/app/[locale]/account/page.tsx.
 *
 * State: local `useState`, lazily initialized from `initialWishlisted` (a
 * server-computed prop — see the PDP for the hydration call) so the button
 * reflects true DB state on first paint instead of always starting
 * "unwishlisted" until the user happens to visit /account/wishlist first in
 * the same session. `useWishlistStore` (Zustand, KTD10) is still updated on
 * every toggle so the account/wishlist page's cross-card sync keeps working,
 * but it is no longer this button's own source of truth for initial render.
 * The actual persistence is always a real POST/DELETE to /api/wishlist,
 * which is the single source of truth; on a failed request the optimistic
 * update is rolled back.
 */

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useWishlistStore } from "@/store/wishlistStore";

interface WishlistButtonProps {
  productId: string;
  /** Translated labels for accessible name / title text. */
  labels: { add: string; remove: string };
  className?: string;
  /**
   * Server-computed initial wishlist status for this product/user, so the
   * button is correct on first paint (page refresh, direct link, new tab)
   * rather than only after the client-side store has been hydrated
   * elsewhere. Defaults to `false` for callers that can't cheaply compute it
   * (e.g. it's always `true` on /account/wishlist, where every card shown is
   * by definition already wishlisted).
   */
  initialWishlisted?: boolean;
}

export function WishlistButton({
  productId,
  labels,
  className,
  initialWishlisted = false,
}: WishlistButtonProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";

  const [isWishlisted, setIsWishlisted] = useState(initialWishlisted);
  const add = useWishlistStore((s) => s.add);
  const remove = useWishlistStore((s) => s.remove);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (status !== "authenticated" || !session?.user) {
      router.push(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`);
      return;
    }

    setError(null);
    const wasWishlisted = isWishlisted;

    // Optimistic flip.
    setIsWishlisted(!wasWishlisted);
    if (wasWishlisted) {
      remove(productId);
    } else {
      add(productId);
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/wishlist", {
          method: wasWishlisted ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });

        if (!res.ok) {
          // Roll back on failure.
          setIsWishlisted(wasWishlisted);
          if (wasWishlisted) {
            add(productId);
          } else {
            remove(productId);
          }
          setError("error");
        }
      } catch {
        setIsWishlisted(wasWishlisted);
        if (wasWishlisted) {
          add(productId);
        } else {
          remove(productId);
        }
        setError("error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleClick();
      }}
      disabled={isPending}
      aria-pressed={isWishlisted}
      aria-label={isWishlisted ? labels.remove : labels.add}
      title={isWishlisted ? labels.remove : labels.add}
      data-error={error ? "true" : undefined}
      className={
        className ??
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-60"
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={isWishlisted ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}
