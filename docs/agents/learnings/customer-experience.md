# customer-experience — durable learnings

## HUB-39 Order Management (2026-09-05)

- **Prisma `Unsupported("tsvector")` diff noise is a known, recurring false
  positive in this repo.** Every `prisma migrate dev --create-only` run
  against `Product.searchVector` regenerates a spurious
  `DROP INDEX products_search_vector_idx` / `ALTER COLUMN search_vector DROP
DEFAULT` pair even when the diff has nothing to do with `Product` or
  `search_vector`. Confirmed present in essentially every prior migration
  file (`20260822094442_init` through `20260830072549_...`). Convention
  (see `20260830072549_add_inventory_log_reference_fields/migration.sql`'s
  own comment): omit that pair from the generated `migration.sql` and leave
  a one-line comment explaining why, rather than applying it. Always inspect
  a freshly generated migration for this pattern before appending anything
  else to it.
- **Backfill SQL appended after Prisma's own statements works cleanly** with
  `gen_random_uuid()` (pgcrypto is already enabled in this Supabase
  instance — no extension setup needed) and a `WHERE NOT EXISTS` guard makes
  it safely idempotent if the migration file is ever re-run against a
  partially-migrated environment.
- **Server Component + server-side `auth()` is the pattern for new
  authenticated pages that need ownership-scoped DB reads directly** (as
  opposed to the older `account/page.tsx` / `wishlist/page.tsx` precedent of
  a client component with `useSession()` + a fetch to a separate API route).
  `src/app/[locale]/products/[slug]/page.tsx` is the existing precedent for
  this pattern (`await auth()`, `getTranslations({ locale })`,
  `redirect()` from `next/navigation` for the unauthenticated case). Used
  this for `/account/orders` and `/account/orders/[id]` since the design
  explicitly called for the server-side `auth()` helper. The proxy
  middleware already gates `/account/*` before the page ever renders, so the
  page-level redirect is defense-in-depth, not the primary gate.
- **Ownership scoping belongs in the Prisma `where` clause, never a
  post-fetch `if`.** `db.order.findFirst({ where: { id, userId } })`
  returning `null` for both "doesn't exist" and "belongs to someone else"
  is what makes those two cases indistinguishable to the caller — a
  post-fetch check (`if (order.userId !== userId) return null`) would leak
  existence via timing/error-shape differences in a way a `where`-clause
  scope structurally cannot.
- **Public, unauthenticated read endpoints (`/api/track`) need a _dual_
  rate-limit key, not one.** Rate-limiting only by IP lets one IP brute-force
  many order-id suffixes; rate-limiting only by the resource (suffix) lets a
  botnet spread the same guesses across many IPs. Checking two independent
  `rateLimiter.check()` calls (`track:ip:<ip>` and `track:suffix:<suffix>`)
  and requiring both to pass closes both gaps with zero changes to the core
  `RateLimiter` class — this pattern is reusable for any other public lookup
  endpoint added later (e.g. WhatsApp order lookups in U16).
- **Generic 404 discipline**: for `/api/track`, "suffix not found", "suffix
  found but email doesn't match", and "order has no linked user at all" must
  all return the exact same `404 { error: "not_found" }` — computing the
  match with `Array.prototype.find()` in application code after a single
  `findMany` query (rather than two sequential DB round-trips with different
  error branches) makes this trivially easy to keep uniform, since there's
  only one return point for "no match".
- **Live DB tests (`*.live.test.ts`, gated by `describeIfDb` on
  `process.env.DATABASE_URL`) are the established way to prove
  ownership-scoping and email-matching behavior against real Postgres**, not
  just mocked Prisma calls — see `src/lib/api/checkout.live.test.ts` (HUR-191
  precedent) and the new `src/lib/api/orders.live.test.ts`. Always clean up
  every created row in `afterAll`, scoped by a `Date.now()`-based suffix in
  test data (email, order tracking number, etc.) to avoid any collision with
  seed/demo data or other parallel test runs.
- **Messages parity test (`src/messages.test.ts`) does exact 1:1 key-set
  comparison** between `en.json`/`so.json` — a stray duplicate key inside one
  locale's object (e.g. writing `"total"` twice in the same namespace while
  drafting) won't be caught by this test (JSON.parse silently keeps only the
  last value) but IS a code smell to catch by inspection before committing;
  I hit this once while drafting the `orders` namespace and fixed it before
  the parity test ran.
- Existing `account.orders` (so.json: "Isbitaallada") and several `admin.*`
  Somali strings are mistranslated (literally "the hospitals" instead of
  "orders") — pre-existing, out of scope for this issue since fixing them
  isn't required by any HUB-39 AC and they're outside the `orders`/`tracking`
  namespaces this issue owns. Flagging here for whichever agent next touches
  Somali i18n content.
