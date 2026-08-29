# Security Reviewer Agent — Learnings

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
