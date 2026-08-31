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

## Checkout (HUR-191): one transaction, guarded-UPDATE stock + coupon race checks, tax stays $0 until a business decision lands

**Symptom:** N/A (proactive, HUR-191, Iron Rules #1 and #3 — the highest-
stakes write path yet, real order + stock + money creation).

**Cause:** N/A — documenting the shape that worked so future checkout-
adjacent work (HUB-40 payments, HUB-39 order management) doesn't
accidentally reintroduce a race or a client-trusted price/tax figure.

**Rule going forward:**

- `placeOrder()` (`src/lib/api/checkout.ts`) does everything — advisory
  lock on the cart id, fresh `tx`-scoped re-read of cart lines, fresh
  re-price from `tx.product`/`tx.productVariant`, stock re-validation,
  guarded stock decrement, coupon re-validate+redeem, address ownership
  check, Order/OrderItem/InventoryLog creation, cart clear — inside **one**
  `db.$transaction`. Never call a pre-transaction "priced cart" helper
  (`getCartLinesPriced()`) as the source of truth inside checkout; it's
  advisory-only for the review UI.
- Stock decrements go through `applyStockDelta(tx, {...})`
  (`src/lib/inventory.ts`), extracted from `adjustStock()` so checkout can
  share the outer `tx` instead of nesting a second `db.$transaction`
  (Prisma anti-pattern — nested transactions silently don't compose the way
  you'd expect). `adjustStock()` itself becomes a thin wrapper: open `tx`,
  call `applyStockDelta`, write `InventoryLog`. Any future caller that needs
  to fold a stock adjustment into a larger existing transaction should
  import `applyStockDelta` directly, never `adjustStock()` (which opens its
  own transaction) and never hand-roll the guarded UPDATE again.
- Coupon redemption is a second guarded UPDATE
  (`redeemCoupon(tx, couponId)` in `src/lib/storefront/coupon.ts`),
  re-checking `is_active`/`max_uses`/`expires_at` in the SQL `WHERE` clause
  itself — not just a prior `evaluateCoupon()` read — so a race between two
  concurrent checkouts against the last remaining use of a capped coupon
  can never both succeed. Throws `CouponRedemptionRaceError` (distinct type,
  not a generic Error) on 0 rows affected. `evaluateCoupon()` stays pure —
  redemption is a separate function, not a mutation added to it.
- Deterministic stock-decrement ordering (`variantId ?? productId`
  ascending) before the per-line guarded UPDATEs avoids a lock-ordering
  deadlock when two concurrent checkouts touch overlapping products in
  different orders.
- `calculateTax()` (`src/lib/storefront/tax.ts`) is a **pure, deliberately
  inert** extension point — always returns `0`. Tax rate/treatment is an
  unconfirmed PRD §0.6 business decision; do not let a future ticket
  "helpfully" hardcode a guessed rate here without that decision landing
  first and the ticket being explicitly re-scoped.
- Proved the concurrency invariant against the real DB, not just mocks:
  `src/lib/api/checkout.live.test.ts` runs two different users' `placeOrder()`
  calls concurrently against a shared product with `stockQuantity: 1` and
  asserts exactly one succeeds, one gets `insufficient_stock`, and final
  stock is exactly 0 — mirrors the `src/lib/inventory.live.test.ts` (HUB-29)
  precedent one layer up the stack. Skips itself when `DATABASE_URL` isn't
  set, so it never breaks a sandboxed `npm test` run.
- **Bash-tool heredoc gotcha:** writing a large (~250+ line) TypeScript file
  containing `` tx.$executeRaw`...${x}...` `` template literals via a Bash
  `cat > file << 'EOF'` heredoc intermittently failed with a shell quote-
  parsing error ("unexpected EOF while looking for matching `''`") even
  though the delimiter was quoted (which should disable all further shell
  parsing of the body). Root cause not fully isolated (reproduced with the
  full file, not with smaller excerpts). Workaround that reliably works:
  write a one-line placeholder via a trivial `printf`/`cat` command, `Read`
  it once, then use the `Edit` tool (which never goes through a shell) to
  replace the placeholder with the full content. Prefer this workaround
  proactively for any large file containing template literals/backticks
  rather than debugging the heredoc further.
