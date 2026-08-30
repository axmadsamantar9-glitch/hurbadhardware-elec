import { describe, it, expect, beforeEach } from "vitest";
import { useWishlistStore } from "./wishlistStore";

/**
 * The Zustand wishlist store is the client-side half of the
 * optimistic-update-with-rollback flow implemented in
 * src/components/storefront/wishlist-button.tsx: on click the button flips
 * this store immediately (add/remove), fires the real POST/DELETE, and — on
 * failure — calls the *opposite* mutator to roll back. The rollback
 * correctness therefore depends entirely on add()/remove()/has() being
 * simple, symmetric, and idempotent, which is what this suite verifies.
 *
 * WishlistButton itself is a "use client" .tsx component (useSession,
 * useRouter, DOM); this repo's vitest config has no jsdom/RTL harness
 * (environment: "node", include: src/**\/*.test.ts only, .tsx excluded from
 * coverage — see docs/agents/learnings/qa-test.md), matching the
 * established pattern of testing extracted pure logic and leaving
 * component-wiring to E2E/dogfood. The store is the extracted pure logic.
 */

describe("useWishlistStore", () => {
  beforeEach(() => {
    useWishlistStore.getState().reset();
  });

  it("starts empty and not hydrated", () => {
    const state = useWishlistStore.getState();
    expect(state.has("p1")).toBe(false);
    expect(state.hydrated).toBe(false);
  });

  it("add() optimistically marks a product as wishlisted", () => {
    useWishlistStore.getState().add("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(true);
  });

  it("remove() unmarks a product", () => {
    useWishlistStore.getState().add("p1");
    useWishlistStore.getState().remove("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(false);
  });

  it("add() is idempotent — adding twice has the same effect as once", () => {
    useWishlistStore.getState().add("p1");
    useWishlistStore.getState().add("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(true);
  });

  it("remove() is idempotent — removing something not present is a no-op", () => {
    expect(() => useWishlistStore.getState().remove("not-there")).not.toThrow();
    expect(useWishlistStore.getState().has("not-there")).toBe(false);
  });

  it("rollback: add() then remove() (simulating a failed POST) restores prior state", () => {
    // Simulates WishlistButton's failure branch: optimistic add(), API
    // call fails, button calls remove() to roll back.
    useWishlistStore.getState().add("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(true);

    useWishlistStore.getState().remove("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(false);
  });

  it("rollback: remove() then add() (simulating a failed DELETE) restores prior state", () => {
    // Simulates WishlistButton's failure branch when un-wishlisting fails:
    // optimistic remove(), API call fails, button calls add() to roll back.
    useWishlistStore.getState().setAll(["p1"]);
    expect(useWishlistStore.getState().has("p1")).toBe(true);

    useWishlistStore.getState().remove("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(false);

    useWishlistStore.getState().add("p1");
    expect(useWishlistStore.getState().has("p1")).toBe(true);
  });

  it("add()/remove() only affect the targeted product, not others", () => {
    useWishlistStore.getState().setAll(["p1", "p2"]);
    useWishlistStore.getState().remove("p1");

    const state = useWishlistStore.getState();
    expect(state.has("p1")).toBe(false);
    expect(state.has("p2")).toBe(true);
  });

  it("setAll() replaces the full set and marks the store hydrated", () => {
    useWishlistStore.getState().add("stale");
    useWishlistStore.getState().setAll(["p1", "p2"]);

    const state = useWishlistStore.getState();
    expect(state.has("stale")).toBe(false);
    expect(state.has("p1")).toBe(true);
    expect(state.has("p2")).toBe(true);
    expect(state.hydrated).toBe(true);
  });

  it("reset() clears the set and hydrated flag (e.g. on sign-out)", () => {
    useWishlistStore.getState().setAll(["p1", "p2"]);
    useWishlistStore.getState().reset();

    const state = useWishlistStore.getState();
    expect(state.has("p1")).toBe(false);
    expect(state.has("p2")).toBe(false);
    expect(state.hydrated).toBe(false);
  });
});
