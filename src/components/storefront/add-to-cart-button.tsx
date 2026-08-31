"use client";

/**
 * "Add to Cart" button (HUR-190, U9 / PRD R8, KTD10). Used on the PDP (and
 * can be reused on product cards later).
 *
 * Unlike WishlistButton, this works for BOTH guest and signed-in users:
 *   - Guest (no session): adds straight to `useCartStore` (localStorage) --
 *     no server call, per KTD10's guest-cart architecture decision.
 *   - Signed-in: POSTs to /api/cart, the DB-backed cart. No client-supplied
 *     price is ever sent -- the request body only carries
 *     productId/variantId/quantity.
 */

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useCartStore } from "@/store/cartStore";

interface AddToCartButtonProps {
  productId: string;
  variantId?: string | null;
  quantity?: number;
  disabled?: boolean;
  labels: { add: string; added: string; unavailable: string };
  className?: string;
}

export function AddToCartButton({
  productId,
  variantId = null,
  quantity = 1,
  disabled = false,
  labels,
  className,
}: AddToCartButtonProps) {
  const { data: session, status } = useSession();
  const addGuestItem = useCartStore((s) => s.addItem);

  const [isPending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (disabled) return;
    setError(null);

    if (status === "authenticated" && session?.user) {
      startTransition(async () => {
        try {
          const res = await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, variantId: variantId ?? undefined, quantity }),
          });
          if (!res.ok) {
            setError("error");
            return;
          }
          setJustAdded(true);
          window.setTimeout(() => setJustAdded(false), 2000);
        } catch {
          setError("error");
        }
      });
      return;
    }

    // Guest: no network call, per KTD10.
    addGuestItem(productId, variantId, quantity);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      data-error={error ? "true" : undefined}
      className={
        className ??
        "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {disabled ? labels.unavailable : justAdded ? labels.added : labels.add}
    </button>
  );
}
