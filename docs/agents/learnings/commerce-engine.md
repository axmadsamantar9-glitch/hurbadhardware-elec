# Commerce Engine — Durable Learnings

## First authenticated write endpoint — session.id is the only trusted userId

**Symptom:** N/A (proactive) — HUR-188/HUB-35 was flagged as the first
genuinely authenticated _write_ endpoint in the storefront-adjacent code
(everything prior, HUR-16/HUR-187, was public/read-only).

**Cause:** Any request body field named `userId` (or similar) is
attacker-controlled. If a route handler ever reads it instead of
`session.user.id`, a signed-in user could mutate another user's rows.

**Rule going forward:** Every authenticated mutation route must derive the
acting user's id exclusively from `await auth()` → `session.user.id`, never
from `request.json()`. Test this explicitly: send a body with a
`userId`/`productId`-adjacent spoofed field and assert the DB call only ever
received the session-derived id (see
`src/app/api/wishlist/route.test.ts` — "ignoring any client-supplied
userId"). This is the pattern to copy for cart, coupon-redeem, and checkout
mutation routes still to come.

## Idempotent add/remove beats optimistic-UI-plus-error-toast for toggle buttons

**Symptom:** A heart/wishlist toggle button that fires POST-to-add can
double-fire (React strict mode remount, network retry, fast double-click)
and hit the DB's `@@unique([userId, productId])` constraint, surfacing a raw
500/409 to a UI action that should always feel like a simple toggle.

**Cause:** Treating "add to wishlist" as a strict insert instead of a
set-membership operation.

**Rule going forward:** Any DB-backed toggle (wishlist, follow, favorite)
should use `upsert` on the compound unique key for "add" and `deleteMany`
(not `delete`, which throws on zero rows) for "remove" — both become
naturally idempotent, so retries/double-clicks are silent no-ops instead of
errors. Reuse this pattern for any future toggle-style commerce feature
(e.g. comparison list, HUB-36).

## Zustand store scope: optimistic UI mirror only, never the write path

**Symptom:** N/A (design decision, documented for future cart-store work).

**Cause:** KTD10 specifies Zustand for cart-adjacent ephemeral UI state, but
it would be easy to accidentally treat the store as the source of truth and
skip the real API write, especially for optimistic-update patterns.

**Rule going forward:** Any Zustand store backing a DB-persisted commerce
feature (wishlist now; cart next) must (a) hold only a mirror of
server state needed for instant UI feedback, (b) never be read by any
server-side code or trusted for persistence, and (c) every mutation method
must be paired 1:1 with a real authenticated fetch() call in the component
that uses it, with rollback on failure. See `src/store/wishlistStore.ts`
and `src/components/storefront/wishlist-button.tsx` for the reference
implementation to mirror for the cart store.
