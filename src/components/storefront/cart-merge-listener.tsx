"use client";

/**
 * Non-rendering listener that merges the guest (localStorage) cart into the
 * DB cart the moment a session becomes authenticated (HUR-190 scope item 5:
 * "Login triggers a cart merge"). Mounted once, sitewide, in
 * src/app/[locale]/layout.tsx (next to the header) so the merge happens
 * regardless of which page the user lands on after signing in.
 *
 * Guarded by a ref so it only fires once per unauthenticated->authenticated
 * transition (not on every re-render while authenticated, and not again on
 * a page navigation within the same session).
 */

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useCartStore } from "@/store/cartStore";

export function CartMergeListener() {
  const { status } = useSession();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const hasMergedRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      wasAuthenticatedRef.current = false;
      hasMergedRef.current = false;
      return;
    }
    if (wasAuthenticatedRef.current || hasMergedRef.current) return;
    wasAuthenticatedRef.current = true;

    if (items.length === 0) return;

    hasMergedRef.current = true;
    fetch("/api/cart/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((res) => {
        if (res.ok) clear();
      })
      .catch(() => {
        // Leave localStorage intact on failure so a retry (next page load,
        // or the next auth transition) can try again instead of losing data.
        hasMergedRef.current = false;
      });
    // Only re-run when auth status flips, not on every `items` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return null;
}
