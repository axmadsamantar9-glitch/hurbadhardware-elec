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

**Correction (HUR-190):** the guest cart is the _exception_ to this rule —
per KTD10, the guest cart's Zustand store (`src/store/cartStore.ts`, with
`persist` middleware -> localStorage) genuinely IS the source of truth for
an unauthenticated user (there is no server-side guest-session mechanism).
The rule above still fully applies once a session exists: after login, the
DB cart takes over and the store is only ever read once more, by
`cart-merge-listener.tsx`, to drain itself into `/api/cart/merge` and then
`clear()`.

## No unique constraint on Cart.userId or CartItem(cartId,productId,variantId) — use advisory locks, not Prisma upsert

**Symptom:** N/A (proactive, HUR-190). The ticket explicitly flagged
`findOrCreateCart` must be race-safe despite `Cart.userId` having no DB
unique constraint (schema also supports guest carts via `sessionId`, so a
unique index on `userId` alone isn't there). `CartItem` similarly has no
unique constraint on `(cartId, productId, variantId)`, so a normal
`db.cartItem.upsert()` (the pattern used for Wishlist, which _does_ have
`@@unique([userId, productId])`) is not available for cart-line
increment-on-add.

**Cause:** Two concurrent requests (two tabs, a retry) both doing
`findFirst` -> `create` (or `findFirst` -> `update`/`create`) without any
locking can both observe "no existing row" and both insert, producing a
duplicate Cart row for one user, or a duplicate CartItem line for the same
product+variant that silently splits quantity across two rows.

**Rule going forward:** When a table lacks a unique constraint you're not
authorized to add (schema changes were out of scope for HUR-190), take a
Postgres advisory lock inside `db.$transaction`, keyed by the entity you're
about to find-or-create — `SELECT pg_advisory_xact_lock(hashtext(${key}))`
— before the `findFirst` check. The lock is transaction-scoped and released
automatically at commit/rollback, so it serializes only the concurrent
callers racing on that exact key, not the whole table. See
`findOrCreateCart()`, `addCartItem()`, and `mergeGuestCartIntoDb()` in
`src/lib/api/cart.ts` — same pattern `adjustStock()` already established in
`src/lib/inventory.ts` (raw SQL inside `$transaction`, just a conditional
`UPDATE` there instead of an advisory lock). Reuse this for any future
table that needs "only one wins" semantics without a schema change.

## Client-supplied price fields: don't just ignore them, don't even accept them in the Zod schema

**Symptom:** N/A (proactive, HUR-190, Iron Rule #1).

**Cause:** It's tempting to accept a wider request body type and just "not
read" a `price`/`unitPriceUsd` field. That's weaker than it looks — a
future edit that destructures the body more broadly (`...body`) could
silently start trusting it.

**Rule going forward:** Every cart/coupon mutation Zod schema
(`AddItemSchema`, `PriceRequestSchema`, etc. in `src/app/api/cart/route.ts`,
`src/app/api/cart/price/route.ts`) has NO price field in its shape at all —
`z.object()` only lists `productId`/`variantId`/`quantity`. Pricing always
comes from a fresh `db.product`/`db.productVariant` read
(`src/lib/api/cart-pricing.ts`'s `priceCartLines()`), never from the
request body, so there's no field to accidentally start trusting later.
Route tests assert this by sending an extra `priceUsd`/`unitPriceUsd` field
in the body and checking the DB call/response never reflects it (see
`src/app/api/cart/route.test.ts`, `src/lib/api/cart-pricing.test.ts`).
