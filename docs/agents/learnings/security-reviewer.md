# Security Reviewer Agent — Learnings

## HUR-191/HUB-38: Checkout — Reference-Quality Extension of Prior Money-Adjacent Patterns (2026-08-31)

**Summary:** Reviewed `placeOrder()` (`src/lib/api/checkout.ts`), the highest-stakes ticket this session (real order creation, atomic stock decrement + coupon redemption, address handling). GREEN, zero critical/high/medium findings. Confirmed `applyStockDelta()` (extracted from HUB-29's reviewed `adjustStock()`) preserves the identical atomic-guard SQL with no regression from the refactor; confirmed checkout calls `applyStockDelta(tx, ...)` directly rather than `adjustStock()` itself, avoiding a nested-`$transaction` Prisma anti-pattern; confirmed deterministic `variantId ?? productId` sort ordering is actually implemented (not just described) before the stock-decrement loop, satisfying the deadlock-avoidance design; confirmed `redeemCoupon()`'s guarded UPDATE checks `is_active`/`max_uses`/`expires_at` atomically in one WHERE clause and its `CouponRedemptionRaceError` is caught and mapped to a clean 409, not an unhandled exception; confirmed `calculateTax()` is a hardcoded, unconditional `0` with zero business-data invention; confirmed zero `order.update()` calls anywhere (Order/OrderItem/InventoryLog are create-only, satisfying order immutability).

**Rule going forward:** When a previously-reviewed money-adjacent primitive (like `adjustStock()`) is refactored to extract a shared inner function (`applyStockDelta()`) for reuse by a new caller (checkout), diff the extracted function's SQL text byte-for-byte against the original reviewed version rather than re-deriving trust from the docstring/comment claims alone — refactors are exactly where a previously-verified guard clause can silently regress (e.g., a dropped WHERE condition) without any test necessarily catching it if the test suite wasn't also updated to target the new function directly.

## HUR-190: Shopping Cart & Coupon — Reference-Quality Money-Adjacent Feature (2026-08-31)

**Summary:** Reviewed the first money-adjacent feature this session (cart pricing, coupon discount calc) and the second authenticated write surface after wishlist. Reviewed GREEN with only two Low, forward-looking findings — no critical/high issues. `priceCartLines()` (`src/lib/api/cart-pricing.ts`) is the strongest server-authoritative-pricing pattern seen so far: its `RawCartLine` input type structurally has no price field, so there's no way for a caller to accidentally wire a client-submitted price through, and both the authenticated (`GET /api/cart`) and public guest-repricing (`POST /api/cart/price`) paths share this single function rather than duplicating pricing logic. Cart-item ownership checks correctly scope by `cart.userId` even when looked up by a bare `cartItemId` (`item.cart.userId !== userId` guard), matching the wishlist precedent. Advisory-lock concurrency control (`pg_advisory_xact_lock(hashtext(userId))` / `hashtext(cartId)`) is correctly per-user/per-cart scoped (not global) and correctly lives inside the same `$transaction` as the read-then-write it protects — verified this explicitly since a lock acquired outside the transaction or released early would be a silent no-op.

**Findings (both Low, non-blocking):**

1. `evaluateCoupon()`'s PERCENT branch (`src/lib/storefront/coupon.ts`) trusts `coupon.value` as pre-bounded to 0–100 with no runtime clamp — a `PERCENT` coupon with `value > 100` in the DB would discount more than the subtotal. Not reachable by customer input in this ticket (only by admin-authored `Coupon` rows, and coupon CRUD is out of HUR-190's scope) — flag for whichever ticket owns admin coupon creation to enforce `value <= 100` for PERCENT type at write time.
2. No upper bound on cart line quantity anywhere in the stack (`isValidQuantity()` only enforces finite-positive-integer) — a user can set a line to `Number.MAX_SAFE_INTEGER` via PATCH or repeated POST-increment. No negative-total/injection/auth impact, purely a sanity gap that will matter once HUB-38 (checkout) consumes cart totals — recommend a `MAX_CART_QUANTITY` constant before checkout is built.

**Rule going forward:** When a pricing/discount function takes a DB-sourced numeric "trust boundary" value (like `Coupon.value` for a PERCENT type, or any admin-authored percentage/rate field), always check whether the _evaluation_ function clamps/validates the range itself or purely assumes upstream (admin CRUD) validation — flag as Low/forward-looking if the write-side validation doesn't exist yet in the codebase, since evaluation-side defense-in-depth is cheap and the write-side ticket may land later or be missed. Also: when reviewing a cart/checkout-adjacent quantity field, explicitly check for an upper bound, not just "positive integer" — this codebase has a recurring gap (no `MAX_CART_QUANTITY` anywhere) worth flagging every time until fixed once, at checkout time at the latest.

## HUR-26: Product Comparison — Cap-Before-Query Fully Neutralizes Unbounded ?ids= Param (2026-08-30)

**Summary:** Reviewed the new comparison feature (client Zustand selection + URL-driven `?ids=a,b,c` Server Component page). `parseCompareIdsParam()` (`src/lib/storefront/compare.ts`) dedupes via `Set` and `.slice(0, MAX_COMPARE_PRODUCTS=3)` before the ids ever reach `getProductsByIds()`'s Prisma `id: { in: ids }` query — confirmed an attacker-supplied `?ids=` with thousands of values still only produces a 3-element `IN (...)`. `getProductsByIds()` correctly filters `isActive: true` (matching the rest of the catalog) and its raw `ProductWithRelations` return is redacted via `toPublicProduct()` before reaching JSX. No new `dangerouslySetInnerHTML` in the diff (grep-verified — only the two pre-existing, already-fixed HUR-16 call sites remain).

**Rule going forward:** When a feature has a UI-enforced cap (e.g. "select up to 3") but also exposes a URL param an attacker can set directly, verify the cap is enforced in the _parsing_ function itself (before the value reaches any DB query), not just assumed from the UI's own affordances — this is the correct pattern to point future builders at.

## Wishlist Write Endpoint — Ownership Enforcement Done Right (HUR-188/HUB-35, 2026-08-30)

**Symptom:** N/A — this is a positive-pattern confirmation, not a bug found. First genuinely authenticated write endpoint in the storefront code (`src/app/api/wishlist/route.ts`), reviewed GREEN with zero findings above Low.

**Rule going forward:** When reviewing the first authenticated write endpoint for a new resource, the reference-quality pattern to check for (and to point builders at) is:

1. The Zod schema for the mutation body deliberately omits any actor-attribution field (e.g. `userId`) so a client-supplied value is silently stripped by `safeParse`, not merely "ignored by convention" — verify with a test that asserts the downstream call uses the session id even when the client sends a spoofed one (see `src/app/api/wishlist/route.test.ts`'s "ignoring any client-supplied userId" test).
2. Every data-layer function takes `userId` as an explicit parameter and every Prisma `where` clause includes it (not just the primary lookup key), so even a guessed foreign id (e.g. `productId`) can't cross the ownership boundary — `deleteMany({ where: { userId, productId } })` is the right shape, not `deleteMany({ where: { productId } })` with an ownership check bolted on separately.
3. A true upsert-on-unique-constraint (`db.<model>.upsert` keyed on a `@@unique([userId, xId])` compound constraint) is the correct idempotency mechanism for "add" endpoints — reject check-then-insert patterns as a race condition risk.
4. Rate-limit key must be namespaced per-resource and per-user/IP (e.g. `` `wishlist:${userId}` ``), matching the precedent at `src/app/api/admin/uploads/presign/route.ts` — this avoids the cross-endpoint shared-key collision found in the HUR-15 review.

## HUR-187: Storefront filter/search state — validate numeric bounds at every layer, not just the outer schema (2026-08-30)

**Symptom:** `toGetProductsQuery()` (`src/lib/storefront/query-state.ts`) parsed `priceMin`/`priceMax` with `Number(str)` and only guarded against `NaN`, not `Infinity`/other non-finite values. Since this helper builds a `GetProductsQuery` object directly (bypassing `GetProductsQuerySchema.parse()`, which does enforce `nonnegative()` via zod), a crafted `?priceMin=Infinity` could reach `new PrismaDecimal(Infinity.toString())` in `getProducts()` — Postgres `NUMERIC` columns don't support `Infinity`, so this could throw and 500 the page for a single request (a crash, not a data-exposure issue — Low severity).

**Cause:** `GetProductsQuery` is just a TypeScript type (inferred from a zod schema) with no runtime enforcement of its own; when a caller constructs the object by hand instead of running it through `GetProductsQuerySchema.parse()`, none of the schema's runtime guards (bounds, coercion safety) actually apply — the type only gives compile-time shape checking.

**Fix applied:** Changed the two `!Number.isNaN(x)` guards to `Number.isFinite(x)` in `toGetProductsQuery()`, and added a regression test (`query-state.test.ts`) covering `Infinity`, `-Infinity`, and `1e400` (JS's own overflow-to-Infinity case) all correctly falling back to `undefined`.

**Rule going forward:** Whenever a new caller builds a `GetProductsQuery` (or any zod-typed query object) by hand rather than via `Schema.parse()`, check that the hand-rolled parsing mirrors _all_ of the schema's runtime constraints (not just NaN-checks) — especially `Number.isFinite()` for any field that flows into a Decimal/numeric DB column. Also flag unbounded `page` values in any new pagination UI as a standing low-severity note (accepted here, not fixed, since it matches this repo's existing `getProducts()`/`GetProductsQuerySchema` behavior — no upper page cap anywhere yet) until the data layer adds an explicit page cap.

**Process note:** This security-reviewer subagent session again had no Write/Edit tool access and had to hand the exact entry text back to the orchestrator. Same recurring gap as the HUR-16 review — confirm security-reviewer subagent invocations get `docs/agents/learnings/` write access going forward.

## HUR-16: Storefront JSON-LD Injection — Unescaped `</script>` in dangerouslySetInnerHTML (2026-08-30)

**Symptom:** `src/lib/storefront/jsonld.ts`'s `buildProductJsonLd`/`buildBreadcrumbJsonLd` output was injected into the page via `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}` in both `src/app/[locale]/products/[slug]/page.tsx` and `src/components/storefront/breadcrumbs.tsx`, with no escaping of `<`/`</script`/U+2028/U+2029 sequences. `JSON.stringify` alone does not neutralize a literal `</script>` substring inside a string value — if it ever appeared in a product/category/brand name, it would close the `<script type="application/ld+json">` tag early and let a following `<script>...</script>` sequence execute in the page.

**Cause:** JSON-LD is JSON injected into an HTML `<script>` context, a different escaping domain than plain JSX text interpolation (which is safe by default). Builders correctly kept the JSON-LD _data_ redacted (typed to only accept `PublicProduct*`, verified stockQuantity-free by a test) but didn't add the separate HTML-context escaping step JSON-in-`<script>` requires.

**Fix applied:** added `toSafeJsonLdString()` to `jsonld.ts` (escapes `<` to `<` before `dangerouslySetInnerHTML`) and switched both call sites to use it; added a regression test asserting a name containing `</script><script>alert(1)</script>` round-trips safely through `JSON.parse` after serialization but never contains a literal `</script>` in the serialized string.

**Rule going forward:** Any `dangerouslySetInnerHTML` used to inject `JSON.stringify(...)` output into a `<script>` tag (JSON-LD or otherwise) must escape `<` before assignment to `__html`. Flag any new/existing JSON-LD or inline-script-injection site that skips this as at least High if the underlying data has _any_ future path to non-seed/non-hardcoded input (admin CMS fields, user-generated content), even if today's data source is fully trusted — the redaction/typing safeguards that stop admin-only _fields_ (stockQuantity, suppliers) from leaking say nothing about HTML-context escaping of the fields that _are_ meant to be public (names, descriptions).

**Process note:** The security-reviewer subagent that found this had only Read/Glob/Grep tools available and could not write this entry itself — handed the exact text back to the orchestrator, who applied both the fix and this entry. Confirm security-reviewer subagent invocations get Edit/Write access to `docs/agents/learnings/` specifically going forward, not just general repo access, so this stops needing a manual carry-over.

## HUB-29: Inventory Ledger — Atomic Guarded UPDATE, createdBy Trust Boundary (2026-08-30)

**Summary:** Reviewed `src/lib/inventory.ts`'s `adjustStock()`, the first `$executeRaw` (not `$queryRaw`) usage this session, implementing PRD §52 Rule #3 (no oversell under concurrency). Confirmed the raw UPDATE uses genuine tagged-template parameterization (no string concatenation/interpolation), the oversell guard (`stock_quantity + delta >= 0`) is inside the same SQL WHERE clause as the UPDATE (atomic, no TOCTOU read-then-write gap), and the `InventoryLog` write + stock UPDATE run in one `$transaction` (confirmed via the live tests: a rejected concurrent call leaves zero residual InventoryLog rows, proving rollback works, not just the success path).

**Finding (Medium, forward-looking, not a defect in this diff):** `adjustStock()`'s `createdBy` parameter is written straight to `InventoryLog` with no validation that it corresponds to the actual authenticated caller — safe today only because nothing calls this function yet from an untrusted context (confirmed via grep — zero callers outside `inventory.ts` and its own tests).

**Rule going forward:** When this function (or any function taking an actor-attribution field like `createdBy`/`actorId`) is eventually wired to a real endpoint (checkout, admin API), verify at that time that the value is derived server-side from the session (`auth()`/`session.user.id`), never accepted as a raw client-supplied request-body field. Flag this explicitly in that future review — don't let a "wire it up later" TODO become a silent trust-boundary violation once a caller exists.

**Process note:** This entry itself is being added retroactively by the orchestrator after production-readiness-gate flagged that no HUB-29 entry existed in this file despite the review being reported as GREEN with this finding — the 5th recurring instance of security-reviewer's findings not landing in the durable record on the first pass (see HUR-13/HUR-177/HUB-24/HUB-27 for prior occurrences). Security-reviewer sessions: write findings to this file as part of finishing the review, not just in handoff prose.

## HUB-28: R2 Presigned Upload Route — PUT-based Presigning Doesn't Enforce Declared Size (2026-08-30)

**Symptom:** Route validates client-declared `sizeBytes` before generating a presigned URL, but nothing prevents the client from uploading a larger file than declared once it has the URL.

**Cause:** `src/lib/uploads/r2.ts`'s `generatePresignedUploadUrl()` uses `PutObjectCommand` + `getSignedUrl` (presigned PUT), which only signs Bucket/Key/ContentType — no size constraint is bindable into a presigned PUT signature. S3-compatible presigned POST (`content-length-range` policy condition) is the mechanism that actually enforces this server-side; it wasn't used here.

**Rule going forward:** For any future presigned-upload flow (R2/S3), treat a client-declared `sizeBytes` check as advisory-only unless the presigning method used is confirmed to support a bound condition (e.g., presigned POST's `content-length-range`). Flag PUT-based presigning without such a condition as at least Medium if the endpoint is trust-boundary-crossing (admin-only lowers severity vs. a public upload endpoint, but doesn't eliminate the gap).

## HUB-26: Brand/Manufacturer/Supplier Schema Migration — Supplier Isolation (2026-08-29)

**Summary:** Reviewed the first genuine schema-migration diff this session (new Brand/Manufacturer/Supplier/ProductSupplier models, dropped legacy `Product.brand` string column, trigger-maintained `brand_name_cache` + rebuilt `search_vector`). Core requirement: supplier data must never reach a public response. Verified clean: `toPublicProduct()`/`toPublicProducts()` (src/lib/api/serialize-product.ts) runtime-delete `suppliers` as defense-in-depth even though no current query includes it; the claimed test suite constructs mocks with fully nested supplier PII (contactName/Email/Phone) and asserts via `JSON.stringify(result)).not.toMatch(/supplier/i)` — not a shallow/tautological check. All 4 public routes and their underlying Prisma calls confirmed to never `include: { suppliers: true }`. `grep -ri suppliers src/` found the relation touched only in serialize-product.ts/.test.ts and the type re-export — no other code path.

**Rule going forward:** For any future PII-adjacent relation (like Supplier here) being added to a schema, the strongest test pattern to require from builders is a mock object WITH the sensitive nested relation attached, asserted absent via full-payload `JSON.stringify` regex match — not just `toHaveProperty` on the top-level key (which misses cases where the field survives under a different key or nested one level down). Also: when a migration set is reported as "Prisma auto-diff included false tsvector drift statements, excluded them," independently open the actual applied migration.sql files and confirm those statements are truly absent rather than trusting the changelog comment — did so here across all 3 new migrations and confirmed clean.

## HUR-177: Lighthouse Tooling Review (2026-08-29)

**Summary:** Reviewed `scripts/lighthouse-audit.mjs` (new dev-tooling script launching headless Chrome via `chrome-launcher` to run Lighthouse audits against hardcoded local `localhost:3000` routes). Confirmed the audited URL list is a hardcoded literal array with no derivation from CLI args/env vars/external input — no SSRF surface. `lighthouse`/`chrome-launcher` correctly scoped as devDependencies only, no production runtime exposure. `.gitignore`'d report JSON artifacts appropriately (Lighthouse reports can capture cookie/header names from the audited page).

**Rule going forward:** The `--no-sandbox` Chrome flag is standard for headless Chrome in CI/dev environments and was not a finding here since the script only ever navigates to hardcoded localhost paths — but if this script (or its flag set) is ever reused against non-hardcoded or externally-supplied URLs, `--no-sandbox` combined with untrusted-URL navigation would become a real risk and should be re-flagged at that point.

**Process note:** Production-readiness-gate has now twice (HUR-13, HUR-177) found that a security review was performed and reported GREEN in the pipeline handoff, but no corresponding entry landed in this file — meaning the durable record didn't match the verbal/handoff report. Writing this entry closes that gap for HUR-177; future security reviews in this pipeline should write their entry to this file as part of finishing the review, not rely on the handoff summary alone to carry the record forward.

## HUR-172: Rate-Limiting & Privacy Guidelines (2026-08-24)

### Rate-limit key trusts spoofable X-Forwarded-For

**Symptom:** Per-IP(+account) rate limiting can be bypassed by rotating a client-supplied X-Forwarded-For header per request.

**Cause:** `getClientIP()` in `src/lib/middleware/rate-limit.ts` reads `x-forwarded-for` verbatim from the Request with no trusted-proxy validation.

**Rule going forward:** When reviewing any new rate-limit-gated endpoint (login, checkout, webhook), check that the deployment platform overwrites/sanitizes X-Forwarded-For before code sees it, or flag as non-blocking MEDIUM follow-up if unconfirmed — do not treat rate-limiting as airtight brute-force protection on this codebase until that's verified.

### Logger PII redaction must cover message AND context

**Symptom:** `redactPII()` applied only to the `context` object; PII embedded in the `message` string argument leaked unredacted (e.g. `logger.info(\`Registered ${email}\`)` leaked the raw email).

**Cause:** `write()` in `src/lib/logger.ts` previously piped `message` straight to `JSON.stringify` without running it through `redactPII`/`scrubString`.

**Rule going forward:** For any logger/redaction diff, verify both the free-text message and every context value are passed through the full redaction pipeline (PII regex + secret-env scrub) — check line-by-line, don't trust a changelog claim.
