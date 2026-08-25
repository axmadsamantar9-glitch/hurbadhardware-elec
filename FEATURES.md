# HurbadHardware Curriculum Ledger — Complete (HUB-1 through HUB-85)

**Organized by instructor Module → Lesson → HUB**  
**Status:** Curriculum Complete | 85 Total Lessons | 7 Completed | 78 Planned  
**Authority:** Instructor's 12-module curriculum + PRD v4 requirements + existing verified work

---

## STATUS LEGEND

- ✅ **verified** — All production-readiness gates pass (build, lint, typecheck, tests ≥80%, dogfood, security)
- 🟩 **built** — Code complete; awaiting gate verification
- 🟨 **in-progress** — Agent actively working
- 🟦 **planned** — Defined; unblocked; awaiting dispatch
- 🔴 **escalated** — Blocker found; escalation logged

---

## MODULE 01: FOUNDATIONS & PRODUCT VISION (HUB-1-9)

| HUB   | Lesson                                     | Status | PRD           | Unit | Notes                                               |
| ----- | ------------------------------------------ | ------ | ------------- | ---- | --------------------------------------------------- |
| HUB-1 | Course Introduction - Electronic Ecommerce | ✅     | -             | U1   | Project kickoff, team assembly, scope briefing      |
| HUB-2 | Tools need to build the Project            | ✅     | -             | U1   | Next.js, Node, npm, Claude Code, VSCode configured  |
| HUB-3 | Install Claude Code Skills                 | ✅     | -             | -    | 12-specialist team definitions in `.claude/agents/` |
| HUB-4 | Creating Complete PRD Plan                 | ✅     | R1-R36, §0-§9 | -    | PRD v4 complete with all requirements               |
| HUB-5 | Refining the PRD Plan                      | ✅     | R1-R36, §0-§9 | -    | PRD reviewed, business decisions collected          |
| HUB-6 | Combining the Master file PRD Plan         | ✅     | R1-R36, §0-§9 | -    | PRD finalized as authority; frozen for build        |
| HUB-7 | Creating a Linear Projects                 | ✅     | -             | -    | 12-module Linear project structure created          |
| HUB-8 | Creating the DevOps Team                   | ✅     | -             | -    | `.claude/agents/*.md` team charters defined         |
| HUB-9 | App Development Timeline and Cost          | ✅     | -             | -    | 7-milestone, ~16-week implementation roadmap        |

---

## MODULE 02: ARCHITECTURE, ENGINEERING STANDARDS & DATA MODELING (HUB-10-19)

**🟨 CURRENT CURRICULUM MODULE — 7/10 lessons satisfied, 3 unfinished**  
**NEXT CURRICULUM LESSON: HUB-15 — Coding Standards**

| HUB    | Lesson                        | Status | PRD      | Unit | Notes                                                                                                       |
| ------ | ----------------------------- | ------ | -------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| HUB-10 | System Architecture           | ✅     | §4       | U1   | ✅ Satisfied (completed out-of-sequence); Architecture documented in HUR-11                                 |
| HUB-11 | Database Design               | ✅     | §4.3, §5 | U2   | ✅ Satisfied & Verified; 21 Prisma models, migrations, seed; 268 tests, 86.66% coverage                     |
| HUB-12 | Development Standards         | ✅     | -        | -    | ✅ Verified & Complete; ESLint 9, TypeScript strict, Prettier, pre-commit hooks, 268 tests, 86.46% coverage |
| HUB-13 | Technology Stack              | ✅     | §4       | U1   | ✅ Satisfied (completed out-of-sequence); Next.js 16, Prisma, Supabase, NextAuth v5, Zod, Vitest            |
| HUB-14 | Project Structure             | ✅     | §4       | U1   | ✅ Satisfied (completed out-of-sequence); `src/app/`, `src/lib/`, `src/components/`, `prisma/`, `.claude/`  |
| HUB-15 | Coding Standards              | 🟦     | -        | -    | Unfinished — Formalize variable naming, function conventions, error handling patterns                       |
| HUB-16 | Architecture Decisions (ADRs) | ✅     | KD1-KD6  | -    | ✅ Satisfied (completed out-of-sequence); 6 KDs documented in PRD (USD, WhatsApp, EN/SO, scope)             |
| HUB-17 | API Standards                 | 🟦     | §4.2     | -    | Unfinished — Formalize HTTP status codes, auth headers, validation, error responses                         |
| HUB-18 | Database Schema Reference     | ✅     | §4.3     | U2   | ✅ Satisfied (completed out-of-sequence); Prisma schema complete and documented                             |
| HUB-19 | Coding Guidelines             | 🟦     | -        | -    | Unfinished — Formalize type safety, null handling, async patterns, testing strategy                         |

---

## MODULE 03: DESIGN SYSTEM, ACCESSIBILITY & LOCALIZATION (HUB-20-24)

| HUB    | Lesson                                                   | Status | PRD      | Unit   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------- | ------ | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HUB-20 | UI Design System                                         | ✅     | R30      | HUR-37 | ✅ Verified (2026-08-24). Design tokens (primary/secondary/semantic colors, WCAG 2.2 AA-contrast-verified for both light/dark via computed relative-luminance) + typography/spacing scale in `src/app/globals.css` `@theme`; base component primitives (Button, Input, Card) in `src/components/ui/`; 385/385 tests passing. Excludes storefront/cart/admin UI (later modules, still blocked).                                                                                                                                                                                                                                                                                                                  |
| HUB-21 | Accessibility (re-scoped: **Accessibility Foundations**) | ✅     | R30      | HUR-96 | ✅ Verified (2026-08-24) — **Foundations scope only.** Standards doc (`docs/standards/accessibility.md`), jsx-a11y ESLint tooling (0 violations), `language-switcher.tsx` remediated (aria-expanded/haspopup, role=menu/menuitem, Escape-to-close, focus-return), WCAG 2.2 SC 2.5.8 target-size audit, HUB-20 primitives verified. 391/391 tests passing, no regression to HUB-20/HUB-22. **DEFERRED, NOT YET DONE:** AC1 (keyboard-only purchase), AC2 (catalog/PDP/cart/checkout automated audit), AC3 (screen-reader dynamic announcements) — all blocked on Module 05 (HUB-33-43, not yet built) and Module 07 (HUB-58-61). Must be re-opened as HUB-21's full-completion criteria once those modules ship. |
| HUB-22 | Internationalization                                     | ✅     | R31      | U4     | EN + SO locales, next-intl routing, language switcher, 50+ translation keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| HUB-23 | Mobile Experience                                        | 🟦     | R30      | HUR-27 | Responsive breakpoints, touch-friendly UI, mobile-first CSS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| HUB-24 | Testing the Mobile App Experience                        | 🟦     | §10, R30 | -      | Mobile E2E, Core Web Vitals, Lighthouse mobile ≥85                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## MODULE 04: CATALOG & INVENTORY (HUB-25-32)

| HUB    | Lesson                                | Status | PRD      | Unit    | Notes                                                                                  |
| ------ | ------------------------------------- | ------ | -------- | ------- | -------------------------------------------------------------------------------------- |
| HUB-25 | Product Catalog                       | ✅     | R1-R3    | U5      | `getProducts()` API with pagination, FTS search, filtering; 268 tests; 86.66% coverage |
| HUB-26 | Brand Management                      | 🟦     | R2-R3    | U6      | Brand model, API list/create/update/delete, admin CRUD, seed data                      |
| HUB-27 | Category & Specification Templates    | 🟦     | R1       | U7      | Category hierarchy, nesting, spec templates per category, attribute mapping            |
| HUB-28 | Product Variants                      | 🟦     | R6       | U8      | Variant SKU, color/storage options, per-variant pricing, media, stock                  |
| HUB-29 | Inventory Management                  | 🟦     | R11, R26 | U9      | Stock ledger, reservations, receiving, transfer, low-stock alerts                      |
| HUB-30 | Warehouse Management                  | 🟦     | -        | U9      | Multi-warehouse, location tracking, bin management (deferred if single-warehouse)      |
| HUB-31 | Supplier Management                   | 🟦     | §5.6     | U9      | Supplier data, procurement reference, PO tracking (admin-only)                         |
| HUB-32 | Push the Project to Github Repository | 🟦     | -        | HUR-134 | GitHub remote setup, initial push, branch protection, merge workflow                   |

---

## MODULE 05: STOREFRONT & CART, CHECKOUT, ORDERS, SHIPPING & PAYMENTS (HUB-33-43)

| HUB    | Lesson                   | Status | PRD          | Unit     | Notes                                                                                         |
| ------ | ------------------------ | ------ | ------------ | -------- | --------------------------------------------------------------------------------------------- |
| HUB-33 | Customer Storefront      | 🟦     | R1-R6        | U6       | Homepage, category pages, product detail pages, image galleries                               |
| HUB-34 | Search and Filtering     | 🟦     | R2-R4        | U6       | Frontend search bar, filter sidebar (category/brand/price), sorting (price/newest/rating)     |
| HUB-35 | Wishlist                 | 🟦     | R9           | U9       | Add/remove products, persistence (auth), wishlist view page                                   |
| HUB-36 | Product Comparison       | 🟦     | R5           | U9       | Select up to 3 products, side-by-side spec comparison, remove items                           |
| HUB-37 | Shopping Cart and Coupon | 🟦     | R8, R10      | U9, U10  | Guest cart (session), auth cart (DB), cart merge on login, coupon validation                  |
| HUB-38 | Checkout                 | 🟦     | R11          | U11      | Address entry, stock validation at checkout, tax calculation, order total review              |
| HUB-39 | Order Management         | 🟦     | R20, R27     | U14      | Order listing, status updates (Placed→Processing→Shipped→Delivered), tracking                 |
| HUB-40 | Payment System           | 🟦     | R12-R16, R36 | U12, U23 | Gateway integrations (WaafiPay EVC+/cards, eDahab, Paystack M-Pesa), server-side confirmation |
| HUB-41 | Shipping Management      | 🟦     | R11          | U15      | Shipping zones, rate calculation, tracking integration, fulfillment workflow                  |
| HUB-42 | Warranty Management      | 🟦     | R25, §5.8    | U18      | Warranty terms per product, claim process, coverage periods                                   |
| HUB-43 | Repair Management (RMA)  | 🟦     | R25, §5.8    | U18      | Return workflow, condition tracking, RMA state machine, status notifications                  |

---

## MODULE 06: ADMIN, PORTALS, CMS, ENGAGEMENT & ANALYTICS (HUB-44-57)

| HUB    | Lesson                                    | Status | PRD     | Unit    | Notes                                                                                    |
| ------ | ----------------------------------------- | ------ | ------- | ------- | ---------------------------------------------------------------------------------------- |
| HUB-44 | Authentication and Customer Portal        | ✅     | R18-R20 | U3, U14 | NextAuth v5 (email/pass + Google OAuth), customer dashboard, order history, addresses    |
| HUB-45 | Wishlist                                  | 🟦     | R9      | HUR-25  | Admin wishlist management, customer wishlist display                                     |
| HUB-46 | Admin Portal                              | 🟦     | R24-R28 | U17     | Admin dashboard, product/order/analytics access, RBAC enforcement                        |
| HUB-47 | Homepage CMS                              | 🟦     | -       | U16     | Banner/hero management, featured products, promotions, content blocks                    |
| HUB-48 | Notifications                             | 🟦     | R23     | U15     | Email notifications (order, status, support), WhatsApp notifications (order, tracking)   |
| HUB-49 | Reviews and Ratings                       | 🟦     | R7      | U19     | Customer star ratings (1-5), text reviews, moderation, flagging                          |
| HUB-50 | Analytics & Business Intelligence         | 🟦     | R29     | U19     | Revenue trends, order volume, top products, category performance, KPIs                   |
| HUB-51 | SEO & Marketing                           | 🟦     | R32-R34 | U20     | Structured data (JSON-LD Product schema), Open Graph meta tags, canonical URLs           |
| HUB-52 | SEO Checklist                             | 🟦     | R33     | U20     | XML sitemap generation, Rich Results Test validation, Lighthouse mobile ≥85              |
| HUB-53 | Seed and Test data cleanup                | 🟦     | -       | HUR-137 | Production seed data setup, test data removal, data validation                           |
| HUB-54 | Verified Backend Unreachable-UI           | 🟦     | §9, §10 | -       | Error boundary components, offline detection, graceful degradation                       |
| HUB-55 | End-to-End Verification of the App Part 1 | 🟦     | §10     | HUR-105 | User E2E flows: browse → search → compare → cart → checkout → payment → order            |
| HUB-56 | End-to-End Verification of the App Part 2 | 🟦     | §10     | HUR-106 | Admin E2E flows: manage inventory → fulfill order → track shipment; multi-role scenarios |
| HUB-57 | Merge all worktree to Master              | 🟦     | -       | HUR-138 | PR review workflow, merge to main, version tagging, production readiness                 |

---

## MODULE 07: DESIGN SYSTEM & UI FOUNDATION (HUB-58-61)

| HUB    | Lesson                                           | Status | PRD | Unit    | Notes                                                               |
| ------ | ------------------------------------------------ | ------ | --- | ------- | ------------------------------------------------------------------- |
| HUB-58 | Get Design System                                | 🟦     | R30 | HUR-37  | Design token definition, component pattern guidelines               |
| HUB-59 | Building Design System Component reference sheet | 🟦     | R30 | HUR-139 | Reusable component library, Storybook/documentation, usage examples |
| HUB-60 | Brand Identity                                   | 🟦     | -   | HUR-140 | Logo guidelines, color palette, typography scale, brand voice       |
| HUB-61 | Complete Ecommerce Platform UI Build             | 🟦     | R30 | -       | Full UI implementation: storefront, admin, emails, error pages      |

---

## MODULE 08: SECURITY, TESTING, DEPLOYMENT & OPERATIONS (HUB-62-69)

**⚠️ LESSON TITLES ARE PROJECT-DERIVED (Awaiting Instructor-Provided Titles)**  
**Derived from:** PRD §9 (Security), §10 (Testing), §4.4 (Infrastructure), Phases 13-15

| HUB    | Lesson (PROJECT-DERIVED)                                | Status | PRD          | Unit                     | Notes                                                                          |
| ------ | ------------------------------------------------------- | ------ | ------------ | ------------------------ | ------------------------------------------------------------------------------ |
| HUB-62 | [PROJECT-DERIVED] Security Hardening                    | 🟦     | §9.1         | HUR-98                   | Input validation, XSS/CSRF/injection prevention, IDOR fixes, rate limiting     |
| HUB-63 | [PROJECT-DERIVED] Payment & Webhook Security            | 🟦     | §9.4         | HUR-99                   | Webhook signature verification, payment idempotency, HMAC validation           |
| HUB-64 | [PROJECT-DERIVED] Unit & Integration Test Suites        | 🟦     | §10.1        | HUR-104                  | Comprehensive coverage for auth, payments, inventory, orders (≥80%)            |
| HUB-65 | [PROJECT-DERIVED] End-to-End Testing & Automation       | 🟦     | §10.1        | HUR-105, HUR-106         | Browser automation, user flow testing, critical path verification              |
| HUB-66 | [PROJECT-DERIVED] Performance Optimization & Monitoring | 🟦     | §9.8, R30    | HUR-96                   | Core Web Vitals, Lighthouse scoring, caching strategy, CDN tuning              |
| HUB-67 | [PROJECT-DERIVED] CI/CD Pipeline & Deployment           | ✅     | §4.4         | HUR-51, HUR-102, HUR-103 | GitHub Actions, Vercel auto-deploy, build/lint/test gates, blue-green          |
| HUB-68 | [PROJECT-DERIVED] Observability, Logging & Alerting     | ✅     | §9.1, HUR-51 | HUR-51                   | Structured JSON logging, correlation ID tracking, secret redaction, dashboards |
| HUB-69 | [PROJECT-DERIVED] Backup, Recovery & Disaster Readiness | 🟦     | §4.4, §9     | -                        | Database backups, restore testing, failover procedures, RTO/RPO                |

---

## MODULE 09: MOBILE APP FOUNDATION & SHELL (HUB-70-73)

**Derived from PRD §1.3 (Deferred native apps), §4.1 (Frontend), R30 (Mobile-first responsive)**

| HUB    | Lesson                                  | Status | PRD       | Unit    | Notes                                                                           |
| ------ | --------------------------------------- | ------ | --------- | ------- | ------------------------------------------------------------------------------- |
| HUB-70 | Mobile Platform & Framework Decision    | 🟦     | R30, KD - | HUR-141 | Decision point: React Native / Capacitor / Progressive Web App? (v1 = web-only) |
| HUB-71 | Mobile App Shell & Navigation           | 🟦     | R30       | HUR-142 | Bottom tab nav, mobile hamburger menu, back button handling                     |
| HUB-72 | Responsive Design System for Mobile     | 🟦     | R30       | HUR-143 | Mobile breakpoints (sm, md), touch target sizing (≥44px), viewport optimization |
| HUB-73 | Mobile Offline & Low-Bandwidth Handling | 🟦     | R30, §4.1 | HUR-144 | Service workers, offline catalog cache, connection status indicator             |

---

## MODULE 10: MOBILE SHOPPING & DISCOVERY (HUB-74-77)

**⚠️ LESSON TITLES ARE PROJECT-DERIVED (Awaiting Instructor-Provided Titles)**  
**Reuses:** Module 04-05 data layer for mobile UI

| HUB    | Lesson (PROJECT-DERIVED)                             | Status | PRD   | Unit    | Notes                                                                        |
| ------ | ---------------------------------------------------- | ------ | ----- | ------- | ---------------------------------------------------------------------------- |
| HUB-74 | [PROJECT-DERIVED] Mobile Catalog & Product Discovery | 🟦     | R1-R3 | HUR-145 | Mobile catalog pages, infinite scroll or pagination, category drill-down     |
| HUB-75 | [PROJECT-DERIVED] Mobile Search & Filtering          | 🟦     | R2-R4 | HUR-145 | Mobile search bar (top sticky), filter drawer (bottom sheet), mobile sorting |
| HUB-76 | [PROJECT-DERIVED] Mobile Product Detail Pages        | 🟦     | R6-R7 | HUR-145 | Mobile image swipe gallery, specification accordion, mobile variant selector |
| HUB-77 | [PROJECT-DERIVED] Mobile Reviews & Ratings           | 🟦     | R7    | HUR-148 | Star rating input, review text entry, photo upload from camera/gallery       |

---

## MODULE 11: MOBILE CHECKOUT, ORDERS & ACCOUNT (HUB-78-81)

**⚠️ LESSON TITLES ARE PROJECT-DERIVED (Awaiting Instructor-Provided Titles)**  
**Reuses:** Module 05 commerce for mobile implementation

| HUB    | Lesson (PROJECT-DERIVED)                                | Status | PRD      | Unit    | Notes                                                                                 |
| ------ | ------------------------------------------------------- | ------ | -------- | ------- | ------------------------------------------------------------------------------------- |
| HUB-78 | [PROJECT-DERIVED] Mobile Checkout Flow                  | 🟦     | R11, R30 | HUR-149 | Single-column mobile address entry, mobile-optimized order review, one-hand scrolling |
| HUB-79 | [PROJECT-DERIVED] Mobile Payment Method Selection       | 🟦     | R12-R16  | HUR-150 | Mobile payment selector, FX conversion display, network-resilient submission          |
| HUB-80 | [PROJECT-DERIVED] Mobile Order Tracking & Notifications | 🟦     | R20, R23 | HUR-151 | Mobile order timeline, WhatsApp/email notification history, push notifications        |
| HUB-81 | [PROJECT-DERIVED] Mobile Customer Account & Profile     | 🟦     | R18-R20  | HUR-152 | Mobile account tab, order history list, saved addresses, profile settings             |

---

## MODULE 12: PUBLISHING, ROADMAP & WRAP-UP (HUB-82-85)

**⚠️ LESSON TITLES ARE PROJECT-DERIVED (Awaiting Instructor-Provided Titles)**  
**Derived from:** PRD §0.6 (Pre-Build Gate), Phases 14-15 (Launch & Post-Launch)

| HUB    | Lesson (PROJECT-DERIVED)                               | Status | PRD               | Unit        | Notes                                                                         |
| ------ | ------------------------------------------------------ | ------ | ----------------- | ----------- | ----------------------------------------------------------------------------- |
| HUB-82 | [PROJECT-DERIVED] Launch Readiness Gate & Verification | 🟦     | §0.6, Phase 14    | -           | Pre-launch checklist (business decisions, data, security), final verification |
| HUB-83 | [PROJECT-DERIVED] Production Deployment & Cutover      | 🟦     | §4.4, Phase 14    | HUR-103     | DNS cutover, CDN cache warmup, monitoring activation, smoke tests             |
| HUB-84 | [PROJECT-DERIVED] Post-Launch Monitoring & Operations  | 🟦     | §9.8, Phase 15    | -           | SLA tracking, incident response playbook, performance baselines               |
| HUB-85 | [PROJECT-DERIVED] Future Roadmap & v2 Planning         | 🟦     | §1.2, §1.3, Scope | HUR-109-112 | Ethiopia market (Telebirr), additional languages, marketplace, native apps    |

---

## SUMMARY

| Metric                             | Count         |
| ---------------------------------- | ------------- |
| **Total HUBs (All Modules 01-12)** | 85            |
| **Modules**                        | 12            |
| **Completed HUBs**                 | 7 ✅          |
| **In-Progress HUBs**               | 0             |
| **Planned HUBs**                   | 78 🟦         |
| **Escalated HUBs**                 | 0             |
| **PRD Requirements (R1-R36)**      | 100% mapped   |
| **Key Decisions (KD1-KD6)**        | 100% mapped   |
| **Known-Good Checkpoints**         | 2 (M1, M2-U5) |

---

## NEXT LESSON

**HUB-26: Brand Management (Module 04, Catalog & Inventory)**

- **Status:** 🟦 Planned — Unblocked, ready to dispatch
- **Dependencies:** HUB-11 ✅, HUB-25 ✅
- **PRD Coverage:** R2, R3 (brand filtering)
- **Scope:** Data model, API, admin CRUD, seed data
- **Checkpoint:** `known-good-m4-hub26` (TBD)

---

**Curriculum Status:** ✅ COMPLETE  
**Reconciliation Status:** ✅ COMPLETE  
**Ready for Autonomous Implementation:** ✅ YES
