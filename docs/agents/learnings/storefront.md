# Storefront Agent — Durable Learnings

## `vitest run` does not load `.env` — a live-DB test silently no-ops without `dotenv/config`

**Symptom:** A test file written to exercise a real concurrency invariant
against the actual dev Postgres DB (HUB-29, `src/lib/inventory.live.test.ts`)
used a `describe.skip`-if-no-`DATABASE_URL` guard as a sandbox-safety
fallback. On first run under `npx vitest run`, the guard tripped and the
entire suite silently skipped ("3 skipped") even in the normal dev
environment where `.env` has a real `DATABASE_URL` — because unlike
`next dev`/`next build` and the `prisma` CLI (which both auto-load `.env`),
plain `vitest run` does not populate `process.env` from `.env` at all.
`src/lib/db.ts`'s `new PrismaClient()` reads `process.env.DATABASE_URL`
directly, so any test file that imports the real (unmocked) `db` singleton
needs the variable present before that import executes.

**Cause:** Vite/Vitest's built-in env loading (`loadEnv`) only ever targets
`import.meta.env`, and only for `VITE_`-prefixed keys unless `envPrefix` is
reconfigured — it does not touch `process.env`, which is what
`@prisma/client` and most Node-side code actually read.

**Rule going forward:** Any test file that intentionally hits the real DB
(unmocked `@/lib/db`) must `import "dotenv/config";` as its first import,
before importing `@/lib/db` or any module that transitively imports it.
`dotenv` is already present as a transitive dependency (via `prisma`/
`next`), so no new package install is needed — just the explicit import.
Keep a `describe.skip`-if-env-missing guard as defense-in-depth for
sandboxes with genuinely no DB access, but don't rely on it as the _only_
thing gating whether the test runs for real — verify with a live run (not
just "0 errors") that the test count that executed matches what you
expect, since a silently-skipped suite reports as "passed" with 0
assertions, not as a failure.

## Tailwind v4 base-shade brand colors fail AA text contrast on dark backgrounds

**Symptom:** A brand color shade (e.g. blue-600 `#1D4ED8`) that passes WCAG AA
(6.7:1) as text on a white background drops to ~2.95:1 — well below the
4.5:1 text threshold — when used as text directly on a dark-mode background
(`#0a0a0a`). The same shade is fine when used as a _filled_ button
background with white foreground text in both modes (contrast is computed
against the fill, not the page background).

**Cause:** A single "primary-600" hex value cannot simultaneously satisfy
AA for (a) white-text-on-primary-fill and (b) primary-text-on-page-background
in both light and dark themes — the luminance math doesn't work out for one
mid-tone hex against both a near-white and a near-black background.

**Rule going forward:** Define two token families per brand color: one for
_fills_ (`--color-primary`, paired with `--color-primary-foreground`,
constant across themes since it's self-contained) and one for _text/icon_
usage (`--color-primary-text`), which must be swapped to a lighter shade
(e.g. `-400`) under `@media (prefers-color-scheme: dark)`. Always verify
every color pairing with the actual relative-luminance formula (not just
"this shade is commonly cited as accessible") against both the light and
dark background hex values in use — a Node one-liner is faster and more
reliable than eyeballing it. Decorative/low-emphasis borders (card dividers)
are exempt from the 3:1 UI-component rule, but _interactive component
boundaries_ (input fields, focus rings) are not — give those their own
dedicated token (`--color-input-border`) verified at >=3:1 against both
themes, separate from the decorative `--color-border`.

## Rate-limit bucket keys must be namespaced by category, not just by identity

**Symptom:** A HIGH-severity finding surfaced only after a second feature
(catalog rate-limiting, HUB-25) started sharing the same rate-limiter `Map`
singleton as an older feature (login rate-limiting). Login's key was
`${clientIP}:${email}` (unprefixed) while catalog's key was
`public:${clientIP}`. Because `email` is attacker-controlled and unvalidated
at the point the rate-limit check runs (it happens before any format/DB
validation), an attacker could POST to the login endpoint with
`X-Forwarded-For: public` and `email: <target-IP>`, producing the key
`public:203.0.113.5` — byte-identical to a real catalog client's bucket key
at that IP. This let an unauthenticated attacker exhaust a legitimate user's
catalog rate-limit bucket at near-zero cost (targeted DoS), entirely as a
side effect of two independently-correct features sharing one keyspace.

**Cause:** Rate-limit keys were built ad hoc per call site
(`${ip}:${email}`, `` `public:${ip}` ``) with no enforced namespace
convention, and the underlying `TokenBucket` store is a single shared `Map`
across all categories/routes. Any two call sites whose key-construction
templates can produce the same string for attacker-choosable inputs will
collide, regardless of how "obviously different" the two features seem.

**Rule going forward:** Every `rateLimiter.check(key, ...)` call site MUST
prefix its key with a static category tag that cannot be produced by
concatenating other fields (`login:${ip}:${email}`, `public:${ip}`,
`checkout:${ip}`, etc.) — never key purely on user-controlled/attacker-
controlled values with no fixed prefix. When adding a new rate-limited
route, grep for `rateLimiter.check(` across `src/` first and confirm no
existing category could construct a colliding string for adversarial input
to the new key's fields. Tests asserting exact key shape (see
`src/__tests__/rate-limit.test.ts`) should be treated as load-bearing
regression guards for this, not just incidental test scaffolding — update
them in lockstep with any key-shape change, but never delete the assertion
that the shape includes the category prefix.

## eslint-config-next already bundles jsx-a11y at `warn`, not `error`

**Symptom:** Adding `eslint-plugin-jsx-a11y` and expecting `npm run lint`
to newly enforce a11y rules had no visible effect at first — the plugin
was already registered under the `jsx-a11y` namespace by
`eslint-config-next/typescript`'s underlying config.

**Cause:** `eslint-config-next` ships `eslint-plugin-jsx-a11y` as a
transitive dependency and registers it under the `plugins: { "jsx-a11y":
... }` key with only ~6 rules set to `"warn"` (alt-text, aria-props,
aria-proptypes, aria-unsupported-elements, role-has-required-aria-props,
role-supports-aria-props). Re-declaring `plugins: { "jsx-a11y": jsxA11y }`
in a second flat-config block throws `ConfigError: Cannot redefine plugin
"jsx-a11y"` (ESLint 9 flat config forbids re-registering the same plugin
key across config objects in the same array).

**Rule going forward:** When a plugin is already registered upstream
(check by grepping `node_modules/<upstream-config>/dist/*.js` for
`plugins:` and the plugin name before assuming it needs installing), add
only a **rules-only** flat-config block (no `plugins` key) that spreads
the plugin's own exported ruleset at the strictness you want, e.g.
`rules: { ...jsxA11y.flatConfigs.strict.rules }` placed _after_ the
upstream config in the array so it overrides the upstream `warn` defaults.
Still add the package as an explicit `devDependency` in `package.json`
even if already transitively present — pin it directly so a future
upstream major bump can't silently change/remove rules you depend on.

## Placeholder `<a href="#">` links for not-yet-built routes fail jsx-a11y/anchor-is-valid

**Symptom:** `src/app/[locale]/account/page.tsx` and `.../admin/page.tsx`
used `<a href="#">Go to Products</a>`-style stubs linking to
not-yet-built dashboard routes (Module 04/06 blocked). Turning on
`jsx-a11y/anchor-is-valid` (part of the strict ruleset) fails the build
on these.

**Cause:** `href="#"` is not a real navigable address; the rule correctly
flags it as an anchor masquerading as an interactive element with no
actual destination.

**Rule going forward:** For a placeholder linking to a feature that
doesn't exist yet, use `<button type="button" disabled aria-disabled="true">`
(matching styling via className) instead of `<a href="#">`. This is the
semantically correct "currently unavailable action," not a real anchor.
Swap it back to a real `<Link href="/actual/route">` once the destination
route ships — do not leave the disabled-button placeholder in place
after the target page exists.

## `flex justify-between` headers with no wrap silently break on the longer-string locale

**Symptom:** `src/app/[locale]/admin/page.tsx`'s header used
`flex justify-between items-center` (no `flex-wrap`/`flex-col` mobile base)
to lay out a `text-3xl font-bold` page title next to a "Sign Out" button.
It looked fine in English at desktop width and in casual EN-only review,
but the Somali translation of the title ("Dashboard-ka Maamulaha", 23
chars) does not fit next to the button at 375px viewport width once the
page's `px-4` edge padding is subtracted — a genuine mobile layout risk
that a same-viewport, same-locale check would miss entirely.

**Cause:** The header had a single-row layout with no mobile-first base
case (violates the mobile-first convention: base classes should be the
narrowest/simplest layout, not a row layout with no smaller-viewport
fallback). Flex items without `flex-wrap` and with default `min-width:
auto` will only shrink to their content's min-content width (longest
unbreakable word), not disappear or scroll gracefully — so a long
translated string plus a fixed-width sibling button is a real collision
risk, not just a theoretical one.

**Rule going forward:** Any `flex justify-between`/`flex row` toolbar or
header pattern must have an explicit mobile-first base case — default to
`flex-col` (stacked) and only switch to `sm:flex-row` (or higher) once
there's confirmed room. When auditing a header/toolbar for mobile
collisions, do not reason about it using only the shorter locale's string
length — pull the actual translated string from `src/messages/so.json`
(the longer of the two locales in this app) and check that specific
string against the narrowest supported viewport (375px), not just the
English string. See `docs/standards/responsive-design.md` Section 3.5 for
the worked fix.

## `getProducts()`'s raw Prisma row (`stockQuantity`) was reaching the public API response

**Symptom:** `/api/products` (`src/app/api/products/route.ts`) returned
`db.product.findMany(...)` results — including the raw `stockQuantity`
integer — directly as JSON, with no redaction step. Iron Rule #6 ("no
inventory counts... in public API responses") was already being violated
before HUB-25's new `getProductBySlug()`/`getCategories()` work started;
it wasn't caught earlier because no test asserted the _absence_ of a
field, only the presence of expected ones.

**Cause:** The data-access layer (`src/lib/api/products.ts`) correctly
returns the full Prisma row — that's the right layer for it, since some
future internal/admin caller may legitimately need the exact count — but
nothing at the Route Handler (the actual public serialization boundary)
stripped it before calling `NextResponse.json()`. `src/lib/api/schemas/common.ts`
already had a `productPublicSchema` with an `inStock: z.boolean()` field
from an earlier ticket (AC22) establishing the intended pattern, but it
was never wired into the products route, and its flat shape doesn't match
this endpoint's actual (bilingual, nested-category) response shape anyway.

**Rule going forward:** Every public product/category Route Handler must
pass its Prisma result through `toPublicProduct()` /
`toPublicProducts()` (`src/lib/api/serialize-product.ts`) before
`NextResponse.json(...)` — this strips `stockQuantity` (including on
nested `variants`) and replaces it with a boolean `inStock`. When adding a
new public field to `Product`/`ProductVariant` in `prisma/schema.prisma`,
audit whether it's inventory/cost/admin data that also needs redacting
here, not just whether the new Prisma query needs to `select`/`include`
it. Do not assume "it's already in the data layer's return type" implies
"it's safe to expose" — those are two different layers with two different
jobs.

## HUB-25 security review: catalog GET routes had no rate-limiting

**Symptom:** `/api/products`, `/api/products/[slug]`, `/api/categories` had
no rate-limiting at all, and `sort=rating`/`sort=popularity` on
`/api/products` runs an unbounded `groupBy` over every matching row on
every request regardless of pagination — a genuinely abuse-worthy
unauthenticated endpoint.

**Cause:** The HUR-172 rate-limit infrastructure (`rateLimiter.check()`,
`createRateLimitResponse()`, `getClientIP()`, `getRateLimitConfig("public")`
= 30 req/min) was wired into login (`src/auth.ts`) but never consumed by
the public catalog Route Handlers — each new public GET endpoint has to
opt in individually, it isn't applied globally.

**Rule going forward:** Every new public (unauthenticated) GET Route
Handler must call `getClientIP(request)` + `rateLimiter.check(`public:${ip}`,
getRateLimitConfig("public").threshold)` as the _first_ line inside the
try block (before any parsing/DB work), returning
`createRateLimitResponse(retryAfter)` early on `!allowed`. Note
`createRateLimitResponse()` returns a plain `Response`, not `NextResponse`
— if the handler's return type is annotated `Promise<NextResponse>`, cast
with `as unknown as NextResponse` rather than loosening the handler's
return type. If a route's `GET` currently takes no parameters (e.g. it had
no query/path params to read), it needs a `request: NextRequest` parameter
added just to extract the IP — that's an intentional signature change, not
scope creep. Route Handlers importing from `next/server` and calling
`db`-backed helpers are testable directly in vitest by mocking the
data-access module (see `src/app/api/health/route.test.ts` for the
pattern) — construct a plain `new Request(url, { headers: { "x-forwarded-for": ip } })`
and call `GET(request)`/`GET(request, { params })` directly; no live server
needed.

## HUB-25: `getProducts()` sort/aggregate design (rating, popularity)

**Symptom/context:** Adding `sort=rating` and `sort=popularity` to
`getProducts()` needed an average (`Review.rating`) and a sum
(`OrderItem.quantity`, excluding cancelled orders) per product —
aggregates Prisma's `orderBy` cannot express directly, and would be easy
to get wrong (e.g. losing deterministic pagination, or leaking an
`in`-query's non-guaranteed row order into the response).

**Rule going forward:** For any "sort by an aggregate not on the base
row" requirement: (1) resolve the full `where` clause and fetch _only_
`{ id, createdAt }` for every matching row (cheap, no pagination) so the
full aggregate + sort can happen before paginating; (2) aggregate via
`groupBy` scoped to those ids only (never aggregate the whole table);
(3) default missing aggregate values to `0` rather than excluding the
row, and always add a secondary deterministic tiebreaker (`createdAt
desc` here) — ties on the primary sort key are otherwise
pagination-unstable across requests; (4) after slicing the sorted id
list to the requested page, re-fetch full rows with `id: { in: pageIds
} }` and **explicitly reorder the result to match `pageIds`** — Prisma
(like the underlying SQL `IN (...)`) does not guarantee the returned row
order matches the input array order. Skipping step (4)'s reorder is the
most likely silent bug here: tests will still pass if they only check
set membership, not order.

## `prisma migrate dev` on `Unsupported("tsvector")` columns always re-triggers a false "drift fix" — and can leave the DB stuck on a stale failed-migration row

**Symptom:** Every single `prisma migrate dev` run against this schema (not
just the first one — this recurred on HUB-26's two separate new migrations)
regenerates `DROP INDEX "products_search_vector_idx"` /
`ALTER TABLE "products" ALTER COLUMN "search_vector" DROP DEFAULT` as part of
its diff, even for migrations that touch nothing related to search. Also
separately: `migrate dev` refused to run at all with "The migration
`20260824164332_add_user_soft_delete` was modified after it was applied. We
need to reset the schema" even though `git diff` showed the migration file on
disk was byte-identical to HEAD and its checksum matched the DB's _latest_
row for that migration name — `migrate status` reported "up to date" the
whole time, only `migrate dev`'s stricter check balked.

**Cause:** `Product.searchVector Unsupported("tsvector")?` means Prisma can
never fully reconcile that column against its own schema model — it treats
the manually-managed `GENERATED ALWAYS AS (...) STORED` definition as drift
on every single diff, permanently, not just once at initial setup (the
existing doc comments in `001_search_vector.sql`/`002_audit_log_...sql` only
warned about this for the _first_ migration, but it recurs on every later
one). Separately, `_prisma_migrations` had _two_ rows for the same migration
name — one from a failed first attempt (`finished_at: null`, from an earlier
incident where the auto-generated diff tried to drop the generated column)
and one from the corrected retry that actually succeeded. `migrate status`
only looks at whether the net schema matches; `migrate dev`'s checksum-drift
check apparently keys off an earlier/first row for a repeated migration name
and flags it as tampered, even though the later row is the authoritative,
successful, checksum-matching one.

**Rule going forward:** (1) Every time you run
`prisma migrate dev --create-only` on this schema, open the generated SQL
and check for the auto-added `DROP INDEX "products_search_vector_idx"` /
`ALTER COLUMN "search_vector" DROP DEFAULT` pair — strip them unconditionally
before applying, regardless of what the actual schema change was about; this
is not a one-time init-migration concern. (2) If `migrate dev` refuses with
"modified after it was applied" but `migrate status` says "up to date" and
`git diff` shows no changes to the migration file, do not run
`migrate reset` (destroys data) — instead query
`SELECT id, migration_name, checksum, finished_at FROM _prisma_migrations
ORDER BY started_at` directly, find a row for that migration name with
`finished_at: null` (a dead failed-attempt row) sitting alongside a later row
with `finished_at` set, and delete only the dead row by its `id` — this is
pure tooling bookkeeping cleanup, not a data-destructive operation, and
restores `migrate dev` to working order without touching real tables. (3)
`prisma migrate dev` (no `--create-only`) drops to an interactive
"Enter a name for the new migration" prompt in this environment even after
successfully applying the intended migration, because it immediately detects
the same tsvector "drift" again — it has no TTY to answer, so the bash
command times out and backgrounds itself. Check the background output file
for "The following migration(s) have been applied" to confirm success, then
kill the still-running `node.exe` process (it's holding the DB advisory
lock and blocking any subsequent `prisma migrate` command until killed) —
do not wait for it to finish on its own.

## `prisma migrate dev` refuses non-interactively even with `--create-only` when the diff drops a non-empty column

**Symptom:** HUB-26 Step 6 (`ALTER TABLE products DROP COLUMN "brand"`, 39
non-null values at the time) failed with `Error: Prisma Migrate has detected
that the environment is non-interactive, which is not supported` — even with
`--create-only` and even piping `y` into stdin. This is a different failure
mode than the tsvector-drift issue documented elsewhere in this file:
`--create-only` alone did not save it here, because Prisma's data-loss
confirmation prompt for a genuinely destructive column drop (not just the
false tsvector drift) requires a real TTY regardless of `--create-only`.

**Cause:** `migrate dev` gates any diff it classifies as data-loss-risking
(dropping a column with existing non-null data) behind an interactive
"Are you sure?" confirmation, and this environment has no TTY to answer it.
Piping `y` via `echo y |` does not satisfy Prisma's specific prompt
mechanism here.

**Rule going forward:** For a migration that intentionally drops/alters a
column with known existing data (already verified safe out-of-band, e.g. via
a prior backfill + verification query), skip `migrate dev` entirely: (1) run
`npx prisma migrate diff --from-schema-datasource prisma/schema.prisma
--to-schema-datamodel prisma/schema.prisma --script` to get the raw SQL, (2)
strip the false tsvector-drift statements per the rule above, (3) hand-create
`prisma/migrations/<timestamp>_<name>/migration.sql` with just the intended
statement(s) plus a comment explaining both the intentional drop and the
omitted false-drift lines, (4) apply with `npx prisma migrate deploy`
(non-interactive, applies pending migrations only, no confirmation prompt).
Always verify the column is actually gone afterward with a direct
`information_schema.columns` query — don't just trust the "successfully
applied" message.

## HUB-27: seeding a new per-category child table after `seedCategoriesAndProducts()` needs slug, not array-index, as the join key

**Symptom/context:** `SpecTemplateKey` needed 35 rows across the 8 existing
seed categories, upserted by `@@unique([categoryId, keySlug])`. The
category's real `id` (a `cuid()`) isn't known until `seedCategoriesAndProducts()`
has actually run and returned the upserted row — it can't be hardcoded or
computed from the source data the way `slug` can.

**Rule going forward:** When seeding a new child table keyed off an existing
seeded parent, key the new seed data by the parent's stable natural key
(here, `Category.slug`, matching the existing `CATEGORIES[].slug` list) and
resolve to the real `id` via `prisma.category.findUnique({ where: { slug } })`
inside the new seed function — never assume array order/index lines up
between two independently-declared seed data structures. Call the new seed
function _after_ the parent-seeding function in `main()`, and extend the
final summary `Promise.all([...counts])` block with the new model's
`.count()` so a `db:seed` run's console output stays a complete manifest of
what got created — this makes a missing/short seed immediately visible
without a separate DB query. Verified end-to-end: applying the migration
(`prisma migrate deploy`, not `migrate dev` — see the tsvector-drift entry
below for why `deploy` is preferred here even for a purely additive
migration with no interactive-prompt risk), then `npx prisma db seed`,
produced exactly 35 rows (5+5+5+3+4+5+4+4) matching the per-category key
counts, confirmed by a direct `specTemplateKey.findMany` + group-by-slug
query — don't trust the seed script's own summary line alone for a new
table, spot-check the actual grouped content at least once.

## Mocking NextAuth's `auth()` export in a route test needs an explicit cast

**Symptom:** `vi.mocked(auth).mockResolvedValue(null)` in a Route Handler
test (`src/app/api/admin/uploads/presign/route.test.ts`) failed
`npm run typecheck` with `Argument of type 'null' is not assignable to
parameter of type 'NextMiddleware'` — even though the route only ever calls
`auth()` as a plain `() => Promise<Session | null>` function.

**Cause:** `auth` (from `src/auth.ts`, NextAuth v5's `NextAuth(...)` return
value) is deliberately overloaded — it can also be invoked as Next.js
middleware (`auth(request)`), and TypeScript's overload resolution for
`vi.mocked(...).mockResolvedValue(...)` picks whichever overload signature
makes the mock's inferred type ambiguous, landing on the middleware
overload instead of the plain-session one.

**Rule going forward:** When mocking `@/auth`'s `auth` export in a test,
don't call `vi.mocked(auth)` directly — declare the narrow signature you
actually need and cast: `const mockedAuth = auth as unknown as
ReturnType<typeof vi.fn<() => Promise<Session | null>>>`, then call
`mockedAuth.mockResolvedValue(...)`. This sidesteps the overload-resolution
ambiguity entirely rather than sprinkling `as any`/`as unknown as Session`
casts at every call site.

## HUR-16: this repo has no JSX/component-render test infra — vitest only runs `.test.ts`, `environment: "node"`, no jsdom/RTL

**Symptom/context:** Writing tests for the first real storefront pages
(homepage, category, PDP) revealed `vitest.config.ts`'s `test.include` is
`["src/**/*.test.ts"]` (not `.tsx`) and `environment: "node"` — there is no
DOM, no `@testing-library/react`, nothing. The only precedent for testing a
React component (`src/components/ui/card.test.ts`) works around this by
calling a `forwardRef` component's `.render(props, ref)` method directly and
asserting on the returned element's `.type`/`.props`, never mounting to a
DOM. That pattern only works for components with **no hooks** — any
component calling `useState`/`useEffect`/`useTranslations` etc. throws
"Invalid hook call" if invoked directly outside React's render context.

**Rule going forward:** For any new interactive (`"use client"`,
hook-using) storefront component (image gallery switching, variant
selector, hamburger menu), do NOT attempt to unit-test the rendered/
interactive behavior in this repo as it stands — there is no infra for it.
Instead: (1) extract all non-trivial logic into plain, hook-free pure
functions in `src/lib/storefront/` (e.g. `sortProductImages`,
`groupVariantOptions`/`findMatchingVariant`, `buildSpecSheet`,
`buildProductJsonLd`/`buildBreadcrumbJsonLd`, `findCategoryBySlug`) and
unit-test _those_ exhaustively — they're where the real bugs live anyway;
(2) keep the "use client" component itself a thin wrapper that just calls
the pure helper and renders `useState`-driven JSX, with no branching logic
worth testing on its own; (3) for Server Components (async function,
no hooks — e.g. the actual `page.tsx` files), invoking the async function
directly and awaiting it is possible in principle (no dispatcher needed)
but wasn't done here for the page components themselves, only the
extracted helpers — treat full page-level rendering/interaction coverage
as a known gap to flag explicitly in status reports, not something to
silently skip. Do not add `jsdom`/`@testing-library/react` yourself to
close this gap unless explicitly asked — that's an infra decision for
qa-test/architect, not a unilateral addition inside a feature ticket.

## `ProductVariant.attributes` (`Json?`) has no schema-enforced shape — every reader must defensively coerce

**Symptom/context:** Building the PDP variant selector (U7) needed to read
per-variant attribute key/value pairs (e.g. storage/color) from
`ProductVariant.attributes`, a bare `Json?` Prisma column with zero
seed data and zero schema-level shape constraint (see the column's doc
comment in `prisma/schema.prisma` — deliberately loose, mirroring
`ProductSpec`'s free-text philosophy).

**Rule going forward:** Never assume `attributes` is `Record<string,
string>` without runtime-checking it first — a malformed/legacy row (null,
an array, a non-string value under some key) must degrade gracefully
(treated as "no attributes"/skip that key) rather than throwing and taking
down the whole PDP. See `readVariantAttributes()` in
`src/lib/storefront/variants.ts` for the coercion pattern (guards `typeof
!== "object"`, `Array.isArray`, and per-value `typeof !== "string"`) — reuse
it rather than re-deriving ad hoc `as Record<string,string>` casts at each
new call site. As of this ticket, zero `ProductVariant` rows exist in the
seed data, so the variant selector UI is untested against real DB data —
only against hand-built fixtures in `variants.test.ts`; flag this as a real
gap whenever seed data for variants eventually lands (verify the selector
against actual seeded storage/color combinations at that point, not just
the unit tests).

## `x || "literal"` fallback silently defeats a zod `.default()` downstream

**Symptom:** `src/app/api/products/route.ts`'s `parseQueryParams()` had
`limit: searchParams.get("limit") || "20"`. `GetProductsQuerySchema`'s
`limit` field has `.pipe(z.coerce.number()...default(DEFAULT_PAGE_SIZE))`
(24), but that default only fires when the piped value is `undefined`. The
route's `||` fallback always supplied the string `"20"` when the query
param was absent, so the schema's `.default(24)` never actually ran in the
live route -- the doc comment and an existing unit test both claimed the
default was 24, but a real `GET /api/products` request with no `limit`
param still returned page size 20. The existing test
(`GetProductsQuerySchema.safeParse(...)` called directly) couldn't catch
this because it bypassed `parseQueryParams()`/the route entirely and only
exercised the schema in isolation.

**Cause:** Route-level "provide a string default, then let the schema
coerce/default it" is a common pattern, but any hardcoded literal fallback
in the route (instead of referencing the shared constant, e.g.
`DEFAULT_PAGE_SIZE`) silently forks the actual default from the
schema/doc-comment's claimed default. Nothing type-checks this drift --
both "20" and the schema's `.default(24)` are individually valid.

**Rule going forward:** When a route hand-builds a query-params object
before `schema.safeParse()`, never hardcode a fallback literal for a field
that also has a `.default(...)` in the schema -- either omit the `||`
fallback entirely (let `undefined` reach the schema so `.default()` is the
single source of truth) or reference the same named constant the schema
uses (`String(DEFAULT_PAGE_SIZE)`), never a bare string/number literal.
More importantly: a schema-level unit test that calls `safeParse` directly
is not sufficient coverage for a route with its own pre-processing step --
add at least one test that calls the actual exported parsing
function/route handler with a URL that omits the param, and assert the
value actually used downstream (e.g. the argument passed to the
data-access call), not just what the schema alone would produce. This
project's product/product-detail routes (`src/app/api/products/route.ts`,
`src/app/api/products/[slug]/route.ts`) had zero route-level test
coverage before this fix (5.26%/0% and 0% per v8 coverage) despite the
data-access layer and schema being separately unit-tested -- "the layer
underneath is tested" is not evidence the route's own glue code (param
defaults, rate-limiting wiring, redaction wiring) is correct. See
`src/app/api/products/route.test.ts` and
`src/app/api/products/[slug]/route.test.ts` for the pattern: mock the
`@/lib/api/products` module (not `db` directly) via `vi.importActual` +
override just the function under test, construct a plain
`new Request(url, { headers: { "x-forwarded-for": ip } })`, and call
`GET()` directly -- no live server or DB needed, and it exercises the real
rate-limiting + redaction + param-parsing wiring end to end.
