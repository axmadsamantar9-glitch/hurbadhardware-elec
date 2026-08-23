# HurbadHardware — Curriculum & Roadmap Audit

Status: **AUDIT ONLY — no Linear, code, or DB changes made.** Prepared per your request to align the Linear roadmap to the instructor's 12-module course before any reorganization begins.

---

## A. Current State

Three parallel structures exist right now, and none of them match each other:

1. **Linear (live, 108 issues)** — a 9-module "professional taxonomy" (Foundations → Architecture → Auth → Backend → Frontend → Testing → Deployment → Documentation → Launch), built in a prior session, explicitly *not* instructor-numbered.
2. **PRD v4 (`docs/plans/PRD.md`) + `FEATURES.md`** — a 23-"Unit" (U1–U23) implementation plan used by the autonomous engineering team. This is requirement-complete and is the best available source for *what* needs building, but its numbering is neither Linear's nor the instructor's.
3. **The instructor's course** (your screenshots) — 12 modules, lesson-level checklist, tracked in a separate app ("HURBAD Institute of Technology"). This is what you want to be the source of truth for module/lesson numbering going forward.

**Linear reality (from live query, all 9 module-projects):**
- 108 issues total (9 module-parent issues + 99 children). Note: the archived parent project's description claims "106 active issues migrated" — a 2-issue discrepancy, not investigated further, flagged for your awareness only.
- **Only 3 issues are not Backlog**: Module 1 (parent, marked Completed at the project level though its 8 business-decision issues are still Backlog), and Module 2's two children `HUR-11` (Project Scaffolding) and `HUR-12` (DB Schema & Migrations), both **Done**.
- Every other issue — all of Modules 3–9 — is untouched Backlog.
- No misplaced issues, no exact duplicates. Four legitimate concept splits worth tidying (not duplicates): CI/CD split across M2/M7, audit-log split M2 (foundation) vs M4 (usage), rate-limiting split M2 (general) vs M3 (auth), privacy split M2 (general) vs M4 (analytics).

**Codebase reality (verified against filesystem, not FEATURES.md's claims):**
- `prisma/schema.prisma` is data-model-complete for the whole PRD (auth, catalog, cart, orders, payments, FX, WhatsApp, inventory, audit — 21 models, 11 enums).
- One real applied migration (`20260822094442_init`) correctly folds in the full-text-search and audit-log-trigger manual SQL.
- **Exactly one API route exists**: `src/app/api/health/route.ts`. No product, cart, checkout, payment, admin, or WhatsApp routes exist anywhere.
- No storefront/admin/account UI exists beyond the default Next.js scaffold page.
- An observability/security baseline (correlation IDs, structured+redacted logging, security headers, audit-log writer, cookie helpers, CI lint/typecheck/build) is real and mostly complete, but isn't yet enforced in CI (no test/coverage gate wired in) and doesn't map to any single PRD Unit — it corresponds to Linear's `HUR-51`.
- **This matches Linear exactly**: U1 (Scaffolding) and U2 (DB Schema) are the only implemented units, matching `HUR-11`/`HUR-12` = Done. Everything else genuinely has zero code.

**Security flag already raised separately**: `.env.example` currently has real Supabase credentials pasted into it (still open, awaiting your go-ahead to clean up).

---

## B. Instructor Curriculum — What Your Screenshots Actually Show

Graded by confidence, because the module *number* wasn't visible in every screenshot even when the lesson *content* was.

| Confidence | Module | Evidence |
|---|---|---|
| **Confirmed (titles given directly by you)** | Module 9: Mobile App Founda[tion]… | Typed/photographed module list, text truncated |
| **Confirmed** | Module 10: Mobile Shopping & … | Same |
| **Confirmed** | Module 11: Mobile Checkout, O[rders]… | Same |
| **Confirmed** | Module 12: Publishing, Roadma[p]… | Same |
| **High confidence (content matches a domain exactly, module number not in frame)** | "Module 2" — Architecture/Standards | Screenshot showed: System Architecture ✓, Database Design ✓ (both checked done), Development Standards, Technology Stack, Project Structure, Coding Standards, Architecture Decisions (ADRs), API Standards, Database Schema Reference, Coding Guidelines — an exact domain match to Linear's current Module 2 |
| **High confidence** | Catalog/Backend module (number not in frame) | Product Catalog, Brand Management, Category & Specification Templates, Product Variants, Inventory Management, Warehouse Management, Supplier Management, **"Push the Project to Github Repository…"** (this last item is a DevOps task oddly sitting inside a catalog lesson list — flagged as an anomaly, needs your confirmation it's really grouped here) |
| **High confidence** | Frontend/UI module (number not in frame) | UI Design System, Accessibility, Internationalization, Mobile Experience, **Testing the Mobile App Experience** (a QA-flavored lesson living *inside* the UI module, not a separate Testing module) |
| **Medium-high confidence — "Module 06: Storefront…"** (partial header fragment visible) | Storefront/Commerce module | Customer Storefront, Search and Filtering, "Wishlist – Moving from Module 5 to…" (the instructor's own note that Wishlist was relocated *into* this module from Module 5), Product Comparison, Shopping Cart and Coupon, Checkout, Order Management, Payment System, Shipping Management, Warranty Management, Repair Management |
| **Unconfirmed — no header visible, module number unknown** | A large bundle module | Authentication and Customer Portal, Wishlist, Admin Portal, Homepage CMS, Notifications, Reviews and Ratings, Analytics & Business Intelligence, SEO & Marketing, SEO Checklist, Seed and Test data cleanup, Verified Backend Unreachable-UI, End-to-End Verification of the App… (×2), Merge all worktree to Master |
| **No data at all** | Module 1 | Not shown in any screenshot |
| **No data at all** | Module 3 | Not shown in any screenshot |

**Two things this already tells us, structurally:**

1. **The instructor's course does not appear to have standalone "Testing," "Deployment/DevOps," or "Documentation" modules in the 1–8 range** (at least not confirmed by anything you've shown me). Testing-flavored lessons ("Testing the Mobile App Experience," "End-to-End Verification," "Seed and Test data cleanup") and release-flavored lessons ("Push the Project to Github Repository," "Merge all worktree to Master") appear to live *inside* feature modules rather than in dedicated QA/DevOps/Docs modules. Linear's current Module 6 (Testing & QA), Module 7 (Deployment & DevOps), and Module 8 (Documentation) — all real and populated with legitimate PRD-derived issues — **may not have a direct 1:1 instructor-module equivalent.**
2. **The instructor's Module 9 title is "Mobile App Foundation,"** which directly collides with Linear's current Module 9 ("Launch & Future Improvements"). Straight renumbering is required, not just relabeling.

I'm not resolving either of these by guessing — see the two open questions below.

---

## C. Linear Problems (Mismatches Against the Instructor Course)

| # | Problem | Detail |
|---|---|---|
| 1 | Module numbering collision | Linear M9 = "Launch & Future Improvements"; instructor M9 = "Mobile App Foundation." All of Linear M1–M9 need renumbering/remapping, not just M9. |
| 2 | Instructor has 12 modules, Linear has 9 | Modules 9–12 (Mobile Foundation, Mobile Shopping, Mobile Checkout/Orders, Publishing/Roadmap) don't exist in Linear at all today — not even as placeholders. |
| 3 | Possible module-count/boundary mismatch in 1–8 | If the instructor genuinely has no separate Testing/DevOps/Docs modules (per B above), then Linear's 9-module scheme has *3 modules the instructor's scheme may not have as top-level modules*, while Linear is *missing 4 mobile modules* the instructor has. This isn't a simple relabeling — it may require dissolving Linear M6/M7/M8 as standalone modules and redistributing their issues as lessons inside the feature modules they test/deploy/document. **This needs your decision — see Section I.** |
| 4 | Wishlist relocation | The instructor's own screenshot note ("Wishlist – Moving from Module 5 to…") shows the instructor already moved this lesson once. Linear currently has Wishlist under Module 5 (Frontend & UI) via `HUR-25` ("[081] Wishlist & Comparison UI"). If the instructor's target module for Wishlist is the Storefront module, Linear needs the same move. |
| 5 | Scope-split pairs (not duplicates, but worth tidying under the new structure) | CI/CD: `HUR-51` (M2) vs `HUR-102` (M7). Audit logs: `HUR-54` (M2, foundation) vs `HUR-95` (M4, usage). Rate limiting: `HUR-100` (M2, general) vs `HUR-53` (M3, auth). Privacy: `HUR-101` (M2, general) vs `HUR-97` (M4, analytics). |

---

## D. Module Mapping (Proposed, Pending Your Answers to Section I)

Legend: 🟢 instructor-confirmed placement · 🟡 high-confidence inferred placement · 🔴 open question, not yet mappable

| Existing Linear Module | Instructor Module (proposed) | Confidence |
|---|---|---|
| Module 1 — Foundations & Product Vision | Instructor Module 1 (title/content unconfirmed — placeholder only) | 🔴 |
| Module 2 — Architecture, Engineering Standards & Data Modeling | Instructor Module 2 — matches exactly | 🟡 |
| Module 3 — Authentication & Authorization | Instructor Module 3 *or* folded into the unconfirmed bundle module (Section B) | 🔴 |
| Module 4 — Backend & API | Split: catalog/inventory/supplier portion → instructor's catalog module (🟡); commerce/checkout/payments/warranty/RMA/WhatsApp/admin-backend portion → placement unconfirmed (🔴) |
| Module 5 — Frontend & UI | Instructor's UI/Frontend module — matches (design system, accessibility, i18n, mobile experience) | 🟡 |
| Module 6 — Testing & Quality Assurance | No confirmed standalone instructor module — may need to distribute into feature modules (see C.3) | 🔴 |
| Module 7 — Deployment & DevOps | No confirmed standalone instructor module — same issue | 🔴 |
| Module 8 — Documentation | No confirmed standalone instructor module — same issue | 🔴 |
| Module 9 — Launch & Future Improvements | Renumber — instructor M9 is "Mobile App Foundation," not Launch. Launch content needs a new home (possibly folded into instructor M12 "Publishing, Roadmap…") | 🟡 (for the fold-in target), 🔴 (final placement) |
| *(none yet)* | Instructor Module 9 — Mobile App Foundation | 🟢 title only, lessons to be planned from PRD (per your instruction) |
| *(none yet)* | Instructor Module 10 — Mobile Shopping & … | 🟢 title only, lessons to be planned |
| *(none yet)* | Instructor Module 11 — Mobile Checkout, Orders… | 🟢 title only, lessons to be planned |
| *(none yet)* | Instructor Module 12 — Publishing, Roadmap… | 🟢 title only, lessons to be planned |

---

## E. Missing Work

- **Nothing is missing from a requirements standpoint** — the PRD (R1–R36, all PRD sections) and Linear's 99 non-parent issues already cover every item on your required-coverage checklist (catalog, cart, checkout, payments, warranty/RMA, WhatsApp, admin, SEO, accessibility, i18n, security, audit logging, etc.).
- **Missing structurally**: Modules 9–12 (Mobile) have zero Linear presence today. Per your instruction, I'll propose PROJECT-PLANNED lesson breakdowns for these once the module-boundary questions in Section I are settled, since mobile work will pull from existing PRD content (checkout, orders, catalog) rather than needing new requirements invented.
- **Missing data (from you)**: instructor Module 1 and Module 3 lesson content; confirmation of which module the "bundle" list (auth portal, admin, CMS, notifications, reviews, analytics, SEO, QA/release tasks) belongs to.

---

## F. Duplicate/Extra Work

None found. The only "extra" items relative to a lesson-by-lesson instructor mapping are Linear's Testing (M6), Deployment (M7), and Documentation (M8) modules — not duplicates or unnecessary, just possibly mis-shaped as standalone modules if the instructor doesn't teach them that way (Section C.3). Nothing here should be deleted; at most, re-parented.

---

## G. Implementation Status (What's Built vs What Remains)

- **Built and verified**: Project scaffold (`HUR-11`/U1), full DB schema + migrations (`HUR-12`/U2), and a largely-complete-but-CI-unenforced observability/security baseline (`HUR-51`, not yet Done in Linear despite the code existing).
- **Not started (0 code)**: everything else — all of Auth (M3), all of Backend/API (M4, 51 issues), all of Frontend/UI (M5, 14 issues), all of Testing (M6), all of Deployment (M7, beyond the CI skeleton), all of Documentation (M8), all of Launch (M9).
- Net: **~2% of the 108-issue backlog has shipped code**, concentrated entirely in foundation/scaffolding. This is expected for a project at this stage — flagging it only so the module remapping doesn't get mistaken for a status report on progress.

---

## H. Proposed Final Structure — v2, CORRECTED against verified screenshot headers (v1 below is superseded and left only for the record)

**v1 was wrong.** It guessed module numbers by content-matching against Linear's pre-existing order. Actual screenshots with visible "MODULE N:" headers (received after v1) show a materially different numbering — most notably: the "Design System" content I called Module 5 is really **Module 3**; the "Storefront/Commerce" content I called Module 6 is really **Module 5**; the "bundle" list I split into two guessed modules (7 and 8) is actually **one single Module 6**; and there's a second, distinct "Design System" module at **Module 7** I had no prior data for at all. Module 1's real content (process/course-setup lessons) doesn't resemble what I'd guessed (business requirements) even slightly.

Legend: 🟢 instructor-confirmed (header + full lesson list directly visible in your screenshots) · 🟡 title confirmed, lessons not yet shown · 🔵 PROJECT-PLANNED (Modules 9–12, PRD-derived per your instruction) · ⚠️ mismatch/gap flagged

| Module | Instructor title (as shown, truncated) | Confirmed lessons | PRD/Linear requirement mapping (proposed, not yet applied) |
|---|---|---|---|
| **01** | FOUNDATION... | Course Introduction – Electronic Ecommerce..., Tools need to build the Project, Install Claude Code Skills, Creating Complete PRD Plan, Refining the PRD Plan, Combining the Master file PRD Plan, Creating a Linear Projects, Creating the DevOps Team, App Development Timeline and Cost | ⚠️ **No clean Linear/PRD mapping** — these are process lessons (this repo's own `AGENTS.md`/`CLAUDE.md`, `docs/plans/PRD.md`, this Linear project's existence, `.claude/agents/*.md` subagent team, timeline/cost estimate). Linear's current Module 1 (8 business-decision issues: merchant onboarding, shipping/tax, warranty policy, launch catalog, legal/infra owners) **does not belong here** — it's real PRD content (§0.6 Pre-Build Readiness Gate) with no instructor-taught home yet in Modules 1–8. Flagged as an open question, not resolved by guessing. |
| **02** | ARCHITECTU... | System Architecture, Database Design, Development Standards, Technology Stack, Project Structure, Coding Standards, Architecture Decisions (ADRs), API Standards, Database Schema Reference, Coding Guidelines | 🟢 Matches Linear's current Module 2 well: `HUR-11` (scaffolding, Done), `HUR-12` (DB schema, Done), `HUR-51` (CI/CD & observability), `HUR-54` (audit log foundation), `HUR-98–101` (security hardening, payment/webhook security, rate limits, privacy) |
| **03** | DESIGN SYST... | UI Design System, Accessibility, Internationalization, Mobile Experience, Testing the Mobile App Experience | Maps to a slice of Linear's current M5: `HUR-37` (Design System Foundation), `HUR-96` (Accessibility & Performance Polish), `HUR-27` (Responsive/Mobile). i18n has **no dedicated Linear issue today** (only PRD/FEATURES U4) — gap to create. "Testing the Mobile App Experience" has no clean Linear home — closest is dissolved M6 testing work, ⚠️ flagged. |
| **04** | CATALOG & IN... | Product Catalog, Brand Management, Category & Specification Templates, Product Variants, Inventory Management, Warehouse Management, Supplier Management, Push the Project to Github Repository | 🟢 Maps to Linear M4's catalog-identity slice: `HUR-15, 55–63` (Product Data Layer, Brand/Manufacturer/Supplier, Category Hierarchy, Product Master Data, Variants & Media, Spec Templates, Compatibility, Condition, Serial/IMEI/MAC, Completeness Gate) |
| **05** | STOREFRONT... | Customer Storefront, Search and Filtering, Wishlist, Product Comparison, Shopping Cart and Coupon, Checkout, Order Management, Payment System, Shipping Management, Warranty Management, Repair Management | 🟢 Maps to Linear M4's commerce/fulfillment/payments/warranty/RMA slice: `HUR-16,20,23,24,26,68–89` plus WhatsApp ordering (`HUR-29,90`, no instructor lesson seen, proposed folded in here as alternate checkout, ⚠️ flag if wrong) |
| **06** | ADMIN, POR... | Authentication and Customer Portal, Wishlist, Admin Portal, Homepage CMS, Notifications, Reviews and Ratings, Analytics & Business Intelligence, SEO & Marketing, SEO Checklist, Seed and Test data cleanup, Verified Backend Unreachable-UI, End-to-End Verification of the App (×2), Merge all worktree to Master | 🟢 Maps to Linear M4's admin-backend slice: `HUR-21,30,91–95,97` (products/inventory/order/payments/procurement/support/content admin, audit review, analytics instrumentation) plus account-dashboard UI (`HUR-67`) plus dissolved-testing items `HUR-105,106` (E2E Suite, Dogfood Entrypoint) plus dissolved-deployment item (worktree/merge ≈ CI/CD release step). SEO has **no dedicated Linear issue today** — gap to create. |
| **07** | DESIGN SYST... *(second, distinct module — full title unknown)* | Get Design System, Building Design System Components, Brand Identity, Complete Ecommerce Platform UI | Maps to the remaining page-building slice of Linear's current M5: `HUR-13,17,18,19,22,64–67,25,31` (homepage/nav, catalog/search UI, product detail, category nav, cart, checkout/payment/tracking UI, wishlist/comparison UI, reviews/coupon UI) |
| **08** | SECURITY, TESTING, D... *(lessons not shown — title only)* | **Not yet confirmed** | Likely absorbs remaining dissolved Testing (`HUR-104,107`) and Deployment (`HUR-39,32,102,103`) issues not already placed in Module 6, plus possibly Documentation (`HUR-40,113–118`) if "D" = Documentation rather than Deployment. **Cannot finalize without the lesson list** — see open items below. |
| **09** | MOBILE APP FOUNDAT... | 🔵 PROPOSED (unchanged from v1): mobile app architecture/tooling decision (PRD §1.3 defers native apps — needs a business decision first), mobile auth/session, mobile design-system port, mobile navigation & offline/low-bandwidth handling | — |
| **10** | MOBILE SHOPPING & D... | 🔵 PROPOSED: mobile catalog/search/product detail, mobile cart & wishlist, mobile comparison, mobile reviews | — |
| **11** | MOBILE CHECKOUT, O... | 🔵 PROPOSED: mobile checkout flow, mobile payment method selection (R12–R16), mobile order tracking & notifications, mobile WhatsApp handoff | — |
| **12** | PUBLISHING, ROADMA... | 🔵 PROPOSED: app-store/distribution readiness, mobile performance gates, absorbs Linear's current Module 9 (Launch & Future Improvements, 6 issues: Pre-Launch Gate, Launch Checklist, Post-Launch Monitoring, Kenya Expansion, Conversion Optimization) | — |

### Open items before this can be final

1. **Module 08's lesson list** is still unseen — I only have its title fragment. Expanding it in the app and sending that screenshot would let me place the remaining Testing/Deployment/Documentation issues correctly instead of guessing between two plausible splits.
2. **Module 1's real mapping problem**: the instructor's Module 1 is process/setup content with no PRD/Linear equivalent, while Linear's existing Module 1 (business-decision register, real and necessary PRD content) has no confirmed instructor home. I'd rather ask than silently invent a placement — likely candidates are folding it into Module 01 as prerequisite work despite not being a literal lesson, or leaving it as a standalone pre-Module-1 gate. Your call.
3. **All titles are still truncated** ("FOUNDATION...", "ARCHITECTU...", "DESIGN SYST..." ×2, "CATALOG & IN...", "STOREFRONT...", "ADMIN, POR...", "SECURITY, TESTING, D...", and all four Mobile/Publishing titles). Not blocking, but the full titles would remove the last bit of guesswork in the module *names* I write into Linear.
4. Module 3 vs Module 7 both being called "DESIGN SYST..." with different lesson sets — I've kept them as two distinct modules per what's shown, not merged or renamed. If you know their full titles, that would resolve which is "standards/foundations" vs "implementation."

---

## H-v1 (superseded — kept for audit trail only, do not use)

Your answers resolved the two blockers: Testing/Deployment/Docs are **embedded, not standalone** — and the "bundle" screenshot turns out to have been a scroll spanning a module boundary. Splitting it by content, the QA/release half (Seed & Test data cleanup, Backend verification, End-to-End Verification ×2, Merge all worktree to Master) is exactly the dissolved content of Linear's old M6+M7+M8, landing together in one wrap-up module — which is internally consistent with "embedded, not standalone." The product/portal half (Auth & Customer Portal, Wishlist, Admin Portal, CMS, Notifications, Reviews, Analytics, SEO/Marketing) is a separate, earlier module.

Legend: 🟢 instructor-confirmed (title or content directly shown) · 🟡 high-confidence inferred (content pattern matches, exact module number not independently visible) · 🔵 PROJECT-PLANNED (Modules 9–12 lessons, derived from PRD per your instruction) · 🔴 still no instructor data, placeholder only

| Module | Title | Lessons (representative, not final numbering) | Confidence |
|---|---|---|---|
| **1** | Foundations & Product Vision *(placeholder — no instructor data)* | Product vision/PRD, business-decision register (merchant onboarding, WhatsApp production access, shipping/tax, returns/warranty/authenticity policy, launch catalog/supplier data, legal/infra/ops owners, NO-GUESS gate) — currently Linear's 8 M1 issues, kept as-is | 🔴 |
| **2** | Architecture, Engineering Standards & Data Modeling | System Architecture, Database Design, Development Standards, Technology Stack, Project Structure, Coding Standards, Architecture Decisions (ADRs), API Standards, Database Schema Reference, Coding Guidelines — plus CI/CD & Observability Baseline, Audit Log Foundation, Security Hardening, Payment/Webhook Security Review, Rate Limits & Abuse Protection, Privacy/Retention (Linear's existing 9 M2 issues) | 🟢 (lesson titles) / 🟡 (issue-to-lesson fit) |
| **3** | Authentication & Authorization *(placeholder — no instructor data)* | Customer Authentication, Admin RBAC, Sessions/Password Reset/Rate Limiting — currently Linear's 4 M3 issues, kept as-is; "Authentication and Customer Portal" lesson in Module 7 is the customer-facing portal integration, distinct from this module's auth mechanics | 🔴 |
| **4** | Product Catalog (Backend) | Product Catalog, Brand Management, Category & Specification Templates, Product Variants, Inventory Management, Warehouse Management, Supplier Management, (release step: "Push the Project to Github Repository") — maps to Linear M4's catalog-identity slice: `HUR-15,55–63` (Product Data Layer, Brand/Manufacturer/Supplier, Category Hierarchy, Product Master Data, Variants & Media, Spec Templates, Compatibility, Condition, Serial/IMEI/MAC, Completeness Gate) | 🟢 (lesson titles) / 🟡 (issue fit) |
| **5** | Frontend & UI | UI Design System, Accessibility, Internationalization, Mobile Experience, Testing the Mobile App Experience — maps to Linear M5's 14 issues, **minus** Wishlist & Comparison UI (`HUR-25`) which moves to Module 6 per the instructor's own relocation note | 🟢 |
| **6** | Storefront & Commerce | Customer Storefront, Search and Filtering, Wishlist (relocated here), Product Comparison, Shopping Cart and Coupon, Checkout, Order Management, Payment System, Shipping Management, Warranty Management, Repair Management — maps to Linear M4's commerce/fulfillment/payments/warranty/RMA slice (`HUR-68–89`, `HUR-16,20,23,24,26`) plus WhatsApp ordering backend (`HUR-29,90`, proposed folded in as an alternate checkout path — no instructor lesson seen for WhatsApp specifically, flagged) and the matching Frontend UI issues (`HUR-22,64–67,25,31` cart/checkout/payment/tracking/account/wishlist/reviews UI) | 🟡 |
| **7** | Customer Portal, Admin & Marketing | Authentication and Customer Portal, Wishlist, Admin Portal, Homepage CMS, Notifications, Reviews and Ratings, Analytics & Business Intelligence, SEO & Marketing, SEO Checklist — maps to Linear M4's admin-backend slice (`HUR-21,30,91–95,97`: products/inventory/order/payments/procurement/support/content admin, audit review, analytics instrumentation) plus SEO issues currently unassigned in Linear (PRD §8.4, R32–R34 — not yet a Linear issue, gap to create) | 🟡 |
| **8** | QA, Verification & Release | Seed and Test data cleanup, Verified Backend Unreachable-UI, End-to-End Verification of the App (×2), Merge all worktree to Master — absorbs **all** of dissolved Linear M6 (5 issues: Testing & QA Foundation, Unit/Integration Suite, E2E Suite, Dogfood Entrypoint, Security/Payment Testing), M7 (4 issues: Deployment Foundation, Performance/Lighthouse, CI/CD Pipeline & PWA, CDN/Monitoring/Cutover), and M8 (7 issues: Documentation Foundation + 6 doc issues) — 16 issues total | 🟡 |
| **9** | Mobile App Foundation | 🔵 PROPOSED: Mobile app architecture/tooling decision (React Native/Expo/Capacitor — PRD explicitly defers native apps in v1, so this needs a business-owned decision first, per PRD §1.3), mobile auth & session handling, mobile design system port from Module 5, mobile navigation & offline/low-bandwidth handling (PRD §4.1, §9.8) | 🔵 |
| **10** | Mobile Shopping & … | 🔵 PROPOSED: Mobile catalog/search/product detail (reusing Module 4 data layer), mobile cart & wishlist, mobile product comparison, mobile reviews | 🔵 |
| **11** | Mobile Checkout, Orders… | 🔵 PROPOSED: Mobile checkout flow, mobile payment method selection (EVC Plus/eDahab/M-Pesa per PRD R12–R16), mobile order tracking & notifications, mobile WhatsApp handoff | 🔵 |
| **12** | Publishing, Roadmap… | 🔵 PROPOSED: App store / distribution readiness, mobile performance & Lighthouse-equivalent gates, production cutover & CDN/monitoring (absorbing the deployment-flavored issues currently sitting in dissolved M7 that are mobile/publishing-relevant), post-launch roadmap evaluation (absorbs current Linear M9's 6 issues: Pre-Launch Gate, Launch Checklist, Post-Launch Monitoring, Kenya Expansion, Conversion Optimization) | 🔵 |

**Important open item this reveals**: Linear's current Module 9 ("Launch & Future Improvements," 6 issues) has no instructor-numbered home except by folding into Module 12 ("Publishing, Roadmap…") — semantically reasonable (launch/roadmap = publishing/roadmap) but not instructor-confirmed. Flagged 🟡 above.

---

## I. Remaining Open Items (non-blocking — I can proceed without these, but confirm when convenient)

1. **Module 1 and Module 3 instructor content** — still no data. Placeholder rows kept 🔴; existing Linear issues stay put until you can share these.
2. **WhatsApp ordering** — no instructor lesson observed anywhere in your screenshots. Proposed folding into Module 6 (Storefront & Commerce) as an alternate checkout path, since that's where the PRD places it functionally. Flag if the instructor teaches it elsewhere (e.g., its own module, or inside Module 7's "Notifications").
3. **SEO** — Linear currently has no dedicated SEO issue (it's a partial line item under `FEATURES.md`'s U20, folded into Frontend work). The instructor's "SEO & Marketing" + "SEO Checklist" lessons in Module 7 imply it should be a first-class issue there — I'll create it during the reorg rather than leave a gap.
4. Once you're satisfied with this skeleton, say so and I'll produce the full 99-issue-level move table (current ID → new Module/Lesson → reason → dependency) as the literal execution script for Section K's Linear reorg — that's the step I'd do right before actually touching Linear.

---

## J. Risk Assessment

- **Low risk to code/DB**: nothing proposed here touches Prisma schema, migrations, or the database. Confirmed safe regardless of how the module questions resolve.
- **Low risk to existing Linear work**: re-parenting/renumbering issues is reversible and non-destructive if done via move rather than delete-recreate (same approach used in the prior 9-module migration).
- **Real risk if I guess on Section I instead of asking**: dissolving M6/M7/M8 prematurely, or misplacing the 15-item bundle list, would require a second disruptive re-migration once the instructor publishes the real Module 1/3 lessons — exactly the "don't invent and mislabel instructor content" failure mode your instructions explicitly warn against.
- **Unrelated open risk**: the `.env.example` live-credential issue (flagged separately, still open).

---

## K. Recommended Execution Order (once Section H is finalized and approved)

1. Rotate the exposed Supabase secret key and clean `.env.example` (independent of everything else, do first).
2. Create the 4 new Linear module-projects for instructor Modules 9–12 (empty containers first).
3. Renumber/rename existing Linear Module 1–9 projects to match confirmed instructor titles (non-destructive rename, not delete-recreate).
4. Re-parent existing issues into corrected modules per the finalized mapping table (move, not duplicate).
5. Create PROJECT-PLANNED lesson issues for Modules 9–12, clearly labeled, sourced from PRD content (mobile-relevant checkout/catalog/order requirements).
6. Re-verify no issue lost its description/acceptance-criteria/dependency links after the moves.
7. Only after Linear is corrected and confirmed: resume implementation (starting wherever the corrected Module order says comes next after the already-Done scaffold/DB work).
