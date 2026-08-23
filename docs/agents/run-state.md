# HurbadHardware — Durable Run State

**This file is the team's long-term memory across context resets. Every agent reads Tier 1 on wake.**

---

## TIER 1 — CURRENT STATE

### NORTH STAR

Build HurbadHardware — a mobile-first B2C electronics e-commerce platform for East Africa (Somalia, Kenya launch; Ethiopia architecture-ready) — per `docs/plans/PRD.md` v4. The platform serves 8 electronics categories via web storefront and WhatsApp ordering, with 4 payment rails (EVC Plus/WaafiPay, eDahab, cards/WaafiPay, M-Pesa/Paystack), bilingual EN/SO UI, and a full admin operations dashboard. Correctness beats speed: payment, inventory, security, and order integrity are launch-critical (PRD §0.4).

### MILESTONE PLAN + CURRENT POSITION

| Milestone | Units | Status |
|-----------|-------|--------|
| **M1: Foundation & Platform** | U1–U4, HUR-51 | ✅ COMPLETE |
| **M2: Product Catalog & Discovery** | U5–U8, U20 partial | 🟦 current milestone (unblocked) |
| M3: Shopping — Cart & Wishlist | U9–U10 | 🟦 blocked on M1, M2 |
| M4: Commerce Engine — Pricing & Checkout | U22, U11 | 🟦 blocked on M1, M3 |
| M5: Payments — Gateways & Reconciliation | U12, U23 | 🟦 blocked on M4 |
| M6: Customer Lifecycle — Accounts, WhatsApp | U14–U16 | 🟦 blocked on M1, M5 |
| M7: Admin Operations & Production Readiness | U17–U19, U21 partial | 🟦 blocked on M1–M6 |

**Current milestone:** M2 (Product Catalog & Discovery)
**Current item:** U6: Product Catalog & Filtering (next unblocked item; dependencies met: U1 ✅, U2 ✅, U5 ✅)

### ACTIVE DECISIONS

1. **Repository state:** The working tree at session start had 28 tracked files (U1 scaffold + U2 schema) locally deleted but not committed as deleted. This must be resolved (restored via `git restore .`, confirmed as intentional, or re-scaffolded) before M1 work begins — the first orchestrator dispatch must address this.
2. **No dogfood entrypoint exists yet.** Per Phase 0 finding, creating this is qa-test's first job — it is required before any item can be marked "verified" by the Production-Readiness gate.
3. **No test runner is configured.** qa-test must set up the test framework (unit/integration/E2E) before M1 items can pass the coverage gate.
4. **Coverage threshold: 80%** (COVERAGE_THRESHOLD knob, default per orchestrator contract).
5. **MAX_ITERATIONS = 8, THRASH_LIMIT = 2** per item (orchestrator contract defaults).
6. **eDahab has no documented sandbox** — per PRD Assumptions, testing may require live funds with minimum-value transactions. Budget accordingly when M5 (payment-gateways) begins.
7. **WaafiPay production base URL is unconfirmed** (`.net` vs `.com` disagreement in PRD Assumptions) — must be confirmed with account manager before M5 production cutover; does not block sandbox development.

### LAST KNOWN-GOOD CHECKPOINT

**2026-08-23: M1 COMPLETE, U5 VERIFIED (known-good-m1-u5)**
- Commit: `d910deb` (chore(m1): finalize M1 foundation & platform milestone)
- All 5 M1 units + HUR-51 verified ✅
- Integration checkpoint green: build/lint/typecheck pass, locale routing works, auth flows work, protected routes enforced, i18n operational, observability baseline live
- Tag: `known-good-m1`
- Next: M2 Product Catalog & Discovery unblocked

### OPEN RISKS / ESCALATIONS

1. **RESOLVED (2026-08-18): Working tree anomaly.** Verified safe (no path overlap with new Phase 2/3 files, all 28 files recoverable from HEAD) and restored via `git restore .`. Dependencies installed (`npm install`); Prisma Client generated (`npm run db:generate`). Build/lint/typecheck all verified green by exit code.
2. **RESOLVED (2026-08-22): No `.env` file / DATABASE_URL/DIRECT_URL unset.** User provisioned a Supabase Postgres project and supplied credentials. Root causes fixed along the way: (a) `.env` had duplicate `DATABASE_URL`/`DIRECT_URL` declarations with empty ones overwriting the real values — deduplicated; (b) the direct-connection host (`db.<ref>.supabase.co:5432`) resolves IPv6-only and is unreachable from this network — `DIRECT_URL` repointed to the same IPv4 Session pooler host as `DATABASE_URL` (documented Supabase workaround for IPv6-less networks); (c) `prisma/migrations/manual/` (reference-only SQL, per its own now-stale comments claiming Prisma ignores it) actually broke `migrate dev` with P3015 — relocated to `prisma/manual-sql/` outside the migrations directory. U2 is now ✅ verified — see FEATURES.md for full detail. This unblocks U3 (auth) and U4 (i18n).
3. **Business decisions pending (PRD §0.6 Pre-Build Readiness Gate):** merchant/payment account confirmation, shipping zones/rates, tax treatment, return/refund window, warranty duration, launch catalog, supplier data — none of these are confirmed. product-planning agent must surface these as blockers when framing affected features (checkout, payments, warranty, shipping).
4. **No CI/CD pipeline exists yet** (no `.github/workflows/`). This is part of U21, scheduled for M7; until then, there is no automated gate on PRs.

---

## TIER 2 — DECISION LOG (append-only, read on demand)

### 2026-08-18 — Team formation approved

**Decision:** User approved a 12-agent specialist roster and 7-milestone plan for autonomous execution of the HurbadHardware PRD v4.

**Roster:** product-planning, architect, auth-platform, storefront, commerce-engine, payment-gateways, customer-experience, admin-ops, performance-deployment, security-reviewer, qa-test, production-readiness-gate.

**Milestones:** M1 Foundation (U1–U4) → M2 Catalog (U5–U8, U20p) → M3 Shopping (U9–U10) → M4 Checkout (U22, U11) → M5 Payments (U12, U23) → M6 Customer/WhatsApp (U14–U16) → M7 Admin/Launch (U17–U19, U21p).

**Alternatives considered:** A leaner 9-agent roster (merging storefront+customer-experience, and auth-platform+admin-ops) was offered but not chosen; user approved the full 12-agent roster as proposed.

**Rationale:** The PRD's payment surface (4 gateways, 3 fundamentally different auth/signing schemes) and its explicit iron-rule list (10 permanent invariants) justified a dedicated payment-gateways agent, a dedicated security-reviewer, and separation between commerce-engine (checkout/pricing) and payment-gateways (adapters/reconciliation) rather than merging them.

### 2026-08-18 — Working tree anomaly discovered, deferred to M1

**Decision:** The Phase 0 investigation found the working tree missing all 28 previously-committed application files (only `.git` and `docs/` present; `git status` shows all as locally deleted, uncommitted). This was documented as an open risk rather than resolved during Phase 0 (Phase 0 is read-only investigation only).

**Rationale:** Per the ENFORCED vs INSTRUCTED principle, resolving this is a mechanical action (likely `git restore .`) best handled by the first dispatched agent (auth-platform, which owns U1/U2) as part of M1, not by the read-only Phase 0 investigation.

### 2026-08-22 — U2 unblocked and verified: Supabase provisioned, migration applied, seed run

**Decision:** User provisioned a Supabase Postgres project and supplied `DATABASE_URL`/`DIRECT_URL` directly into `.env` (never pasted into chat). Proceeded to generate and apply the initial Prisma migration and run the seed, per explicit user authorization at each step.

**What was fixed en route (all diagnosed from observed errors, nothing invented):**
1. `.env` had duplicate `DATABASE_URL`/`DIRECT_URL` keys where a later empty declaration silently overwrote the real value — deduplicated to one declaration each.
2. Supabase's direct-connection host resolves IPv6-only; this network has no IPv6 route, causing `P1001`. Fixed by pointing `DIRECT_URL` at the same IPv4 Session pooler host `DATABASE_URL` uses (port 5432) — Supabase's documented workaround for IPv6-less networks. Same credentials, no password change.
3. `prisma/migrations/manual/` (containing `001_search_vector.sql` and `002_audit_log_append_only.sql`, both explicitly documented as reference-only fragments to fold into the first real migration) does NOT behave as its own comments claimed ("invisible to the migration engine") — it broke `prisma migrate dev` with `P3015`. Relocated both files to `prisma/manual-sql/`, outside the migrations directory Prisma scans.
4. Generated `20260822094442_init` via `migrate dev --create-only`, then folded in both manual SQL fragments exactly per their documented instructions (delete the plain `search_vector` column, append the generated-tsvector + GIN index, append the audit-log append-only triggers).
5. A killed `migrate dev` process (it hung on an unexpected post-apply "new migration name" prompt in a non-interactive shell) left a zombie session on the Supabase server still holding the migrate advisory lock. Diagnosed via `pg_stat_activity`, terminated with `pg_terminate_backend()` after explicit user go-ahead (the auto-mode classifier correctly gated this as a destructive action).

**Verification (production-readiness-equivalent, done directly since no builder/gate agent was dispatched for this narrow DB-unblock task):** `migrate status` → up to date; `migrate deploy` → 0 pending, exit 0; seed → 8 categories, 40 products, 80 images, 2 coupons, admin user; full-text search query against `search_vector` returns matches; cascade delete (Product → ProductImage/ProductSpec) verified via a rolled-back transaction (no data lost); `build`/`lint`/`typecheck` all exit 0.

**Learning for future items:** when a manual/reference-only SQL directory sits inside `prisma/migrations/`, verify empirically whether the current Prisma version actually ignores it before trusting an in-repo comment's claim — behavior changed and broke `migrate dev`. Also: `prisma migrate dev` can prompt interactively after applying pending migrations even when no real drift exists; prefer `migrate deploy` (non-interactive, deploy-only) once an initial migration already exists, and reserve `migrate dev --create-only` for generating new migration files.

### 2026-08-23 — M1 Foundation & Platform Complete

**Decision:** All 5 M1 units (U1–U4) + HUR-51 (CI/CD baseline) verified and integrated. M1 integration checkpoint passed (build/lint/typecheck green, locale routing functional, auth flows operational, protected routes enforced, i18n switching live, observability baseline active). Tagged `known-good-m1` commit d910deb. M2 Product Catalog & Discovery unblocked.

**Summary of M1 Verification:**
- U1 Project Scaffolding ✅ (2026-08-18) — scaffold, dependencies, tooling
- U2 Database Schema ✅ (2026-08-22) — Prisma, migrations, seed data (8 categories, 40 products, 80 images)
- HUR-51 CI/CD & Security Baseline ✅ (2026-08-23) — correlation ID, logger redaction, security headers, secure cookies, CI gates
- U3 Authentication System ✅ (2026-08-23) — NextAuth v5, email/password + Google OAuth, protected routes, session management
- U4 i18n Foundation ✅ (2026-08-23) — next-intl, locale routing (/en/, /so/), language switcher, EN + SO translations, secure cookie server action

**Issues Resolved During Run:**
1. HUR-51: Logger and security headers implemented, dogfood entrypoint created
2. U3: Three CRITICAL security fixes applied during review (bcrypt cost consistency, OAuth dangerous linking, auth redirects)
3. U4: Three CRITICAL security vulnerabilities fixed during review (open redirect validation, insecure cookie → server action, locale preservation in redirects); ONE CRITICAL blocker fixed in gate (missing NextIntlClientProvider context)

**Learnings Promoted to Agent Charters:**
- qa-test: Dogfood design principles, TypeScript patterns (AbortController for fetch timeout), test environment limitations
- production-readiness-gate: TypeScript fetch patterns, ESLint 9+ migration, test mocking strategies

**Next:** M2 Product Catalog & Discovery (U5–U8, U20 partial) — storefront agent owns these units. Dependencies met: U1, U2 ✅. No blockers.
