# Security Reviewer Agent — Learnings

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
