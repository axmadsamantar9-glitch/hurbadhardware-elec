# HurbadHardware Curriculum Ledger

**Organized by instructor Module → Lesson → HUB → Implementation Units**  
**Last updated: 2026-08-23**  
**Authority: Instructor's 12-module curriculum (Modules 01-12) + PRD requirements + existing implementation**

---

## STATUS LEGEND

- ✅ **verified** — Production-readiness gate: all checks pass (build, lint, typecheck, tests ≥80%, dogfood, security)
- 🟩 **built** — Code written; awaiting verification gate
- 🟨 **in-progress** — Agent actively working
- 🟦 **planned** — Defined, not yet assigned
- 🔴 **escalated** — Blocker found; escalation details noted

---

## MODULE 01: FOUNDATIONS & PRODUCT VISION

**Status:** ✅ Partially Complete (HUB-1-3 done; HUB-4-9 are business decisions, not code)

| HUB | Lesson | Status | Covered By | Notes |
|-----|--------|--------|-----------|-------|
| HUB-1 | Course Introduction - Electronic Ecommerce | ✅ | U1 scaffold + project setup | Project initialized, team assembled |
| HUB-2 | Tools need to build the Project | ✅ | U1 scaffold | Next.js 16, Node, npm, VSCode, Claude Code configured |
| HUB-3 | Install Claude Code Skills | ✅ | U1 scaffold | 12-agent team defined in `.claude/agents/*.md` |
| HUB-4 | Creating Complete PRD Plan | ✅ | PRD.md v4 | Product requirements documented |
| HUB-5 | Refining the PRD Plan | ✅ | PRD.md v4 + iterations | PRD reviewed and approved |
| HUB-6 | Combining the Master file PRD Plan | ✅ | PRD.md v4 | PRD finalized |
| HUB-7 | Creating a Linear Projects | ✅ | Linear (12 modules) | Linear projects created and reorganized |
| HUB-8 | Creating the DevOps Team | ✅ | `.claude/agents/` + `AGENTS.md` | 12-specialist team defined |
| HUB-9 | App Development Timeline and Cost | ✅ | PRD.md §0.1, run-state.md | 7-milestone, ~16-week timeline planned |

---

## MODULE 02: ARCHITECTURE, ENGINEERING STANDARDS & DATA MODELING

**Status:** ✅ Partially Complete (HUB-11 done; HUB-10, 12-19 partially via PRD)

| HUB | Lesson | Status | Covered By | Notes |
|-----|--------|--------|-----------|-------|
| HUB-10 | System Architecture | ✅ | PRD.md, U1 scaffold | Next.js + Supabase Postgres + NextAuth v5 + next-intl architecture defined |
| HUB-11 | Database Design | ✅ | U2 migrations + Prisma schema | Full schema: 21 models, 11 enums, indexes, audit triggers, full-text search |
| HUB-12 | Development Standards | 🟦 | Partially via `.eslintrc`, `tsconfig` | ESLint 9, TypeScript strict, Prettier configured; coding guidelines documented in PRD |
| HUB-13 | Technology Stack | ✅ | U1 scaffold + PRD | Next.js 16, Prisma ORM, Supabase, NextAuth v5, next-intl, Zod, Vitest |
| HUB-14 | Project Structure | ✅ | U1 scaffold | `src/app/`, `src/lib/`, `src/components/`, `prisma/`, `.claude/` structure established |
| HUB-15 | Coding Standards | 🟦 | `.eslintrc.json` + PRD | Standards documented; enforcement via CI gates |
| HUB-16 | Architecture Decisions (ADRs) | 🟦 | PRD.md (Key Decisions KD1-KD6) | ADRs documented in PRD (USD pricing, WhatsApp Cloud API, EN+SO languages, etc.) |
| HUB-17 | API Standards | 🟦 | Partially via `/api/health` | REST API conventions established; will be formalized in HUB-17 |
| HUB-18 | Database Schema Reference | ✅ | `prisma/schema.prisma` + seed | Complete reference schema with migrations |
| HUB-19 | Coding Guidelines | 🟦 | Partially via code review | Guidelines in place; will be documented in HUB-19 |

---

## MODULE 03: DESIGN SYSTEM, ACCESSIBILITY & LOCALIZATION

**Status:** ✅ Partially Complete (HUB-22 done; HUB-20-21, 23-24 not started)

| HUB | Lesson | Status | Covered By | Notes |
|-----|--------|--------|-----------|-------|
| HUB-20 | UI Design System | 🟦 | Deferred to Module 07 (HUB-58) | Design system components planned for HUB-58-61 |
| HUB-21 | Accessibility | 🟦 | Planned for storefront (HUB-33+) | Accessibility standards will be applied during storefront build |
| HUB-22 | Internationalization | ✅ | U4 (next-intl implementation) | EN + SO locales, locale routing (/en/, /so/), language switcher, 50+ translation keys |
| HUB-23 | Mobile Experience | 🟦 | Planned for Module 09+ | Mobile app/responsive design deferred to mobile modules |
| HUB-24 | Testing the Mobile App Experience | 🟦 | Planned for Module 06 (HUB-54+) | Mobile testing will be part of E2E verification suite |

---

## MODULE 04: CATALOG & INVENTORY

**Status:** 🟨 In Progress (HUB-25 done; HUB-26+ planned)

| HUB | Lesson | Status | Covered By | PRD Req | Notes |
|-----|--------|--------|-----------|---------|-------|
| HUB-25 | Product Catalog | ✅ | U5 (Product Data Layer) | R1-R3 | `getProducts()` API with pagination, FTS search, category/brand/price filters; 268/268 tests; 86.66% coverage |
| HUB-26 | Brand Management | 🟦 | U6 (planned) | R3, R2 | Brand data model, API endpoints for list/create/update; admin brand CRUD |
| HUB-27 | Category & Specification Templates | 🟦 | U7 (planned) | R1 | Category hierarchy, spec templates for product details |
| HUB-28 | Product Variants | 🟦 | U8 (planned) | R6 | Variants (storage, color, etc.); variant pricing; media per variant |
| HUB-29 | Inventory Management | 🟦 | Part of U9+ | R11 | Stock levels, availability checks, low-stock alerts |
| HUB-30 | Warehouse Management | 🟦 | Deferred | - | Multi-warehouse support; in-scope if needed for v1 |
| HUB-31 | Supplier Management | 🟦 | Deferred | - | Supplier info; procurement; deferred to admin work |
| HUB-32 | Push the Project to Github Repository | 🟦 | Part of CI/CD (HUR-51) | - | GitHub remote setup, push automation; planned in Module 08 |

---

## MODULE 05: STOREFRONT & CART, CHECKOUT, ORDERS, SHIPPING & PAYMENTS

**Status:** 🟦 Planned (no work started)

| HUB | Lesson | Status | Planned Unit | PRD Req | Notes |
|-----|--------|--------|--------------|---------|-------|
| HUB-33 | Customer Storefront | 🟦 | U6 | R1-R6 | Homepage, catalog browsing, product detail pages |
| HUB-34 | Search and Filtering | 🟦 | U6 | R2-R4 | Frontend for FTS search, category/brand/price filters, sorting |
| HUB-35 | Wishlist | 🟦 | U9 | R9 | Wishlist add/remove, persistence, authenticated users |
| HUB-36 | Product Comparison | 🟦 | U9 | R5 | Side-by-side product spec comparison (up to 3 products) |
| HUB-37 | Shopping Cart and Coupon | 🟦 | U9 | R8-R10 | Guest + auth cart, coupon application, merging on login |
| HUB-38 | Checkout | 🟦 | U11 | R11 | Address entry, order review, stock validation |
| HUB-39 | Order Management | 🟦 | U14 | R20-R27 | Order tracking, status updates, fulfillment notes |
| HUB-40 | Payment System | 🟦 | U12, U23 | R12-R16, R36 | Integrations: WaafiPay (EVC+, cards), eDahab, Paystack (M-Pesa); server-side confirmation |
| HUB-41 | Shipping Management | 🟦 | U15 (planned) | R11 | Shipping zones, rates, tracking; fulfillment workflow |
| HUB-42 | Warranty Management | 🟦 | U18 (planned) | R25 | Warranty periods, coverage, claim process |
| HUB-43 | Repair Management (RMA) | 🟦 | U18 (planned) | R25 | Return/repair workflow, conditions, status tracking |

---

## MODULE 06: ADMIN, PORTALS, CMS, ENGAGEMENT & ANALYTICS

**Status:** 🟨 Partially In Progress (HUB-44 auth done; rest planned)

| HUB | Lesson | Status | Planned Unit | PRD Req | Notes |
|-----|--------|--------|--------------|---------|-------|
| HUB-44 | Authentication and Customer Portal | ✅ | U3, U14 | R18-R20 | NextAuth v5 (email/pass + Google OAuth), customer dashboard, order history, addresses, profile |
| HUB-45 | Wishlist | 🟦 | U9 | R9 | (Duplicate of HUB-35 context; wishlist in customer portal) |
| HUB-46 | Admin Portal | 🟦 | U17 | R24-R28 | Admin dashboard access control, RBAC (admin role enforcement) |
| HUB-47 | Homepage CMS | 🟦 | U16 (planned) | - | Content management for homepage banners, promotions, featured products |
| HUB-48 | Notifications | 🟦 | U15 | R23, R27 | Email + WhatsApp notifications for orders, status changes, support |
| HUB-49 | Reviews and Ratings | 🟦 | U19 (planned) | R7 | Customer reviews (1-5 stars), text reviews, moderation |
| HUB-50 | Analytics & Business Intelligence | 🟦 | U19 | R29 | Revenue, order volume, top products, daily/weekly/monthly trends |
| HUB-51 | SEO & Marketing | 🟦 | U20 | R32-R34 | Structured data (JSON-LD Product schema), Open Graph, canonical URLs |
| HUB-52 | SEO Checklist | 🟦 | U20 | R33 | Sitemap generation, structured data validation, Lighthouse mobile ≥85 |
| HUB-53 | Seed and Test data cleanup | 🟦 | Part of QA (HUB-56) | - | Production seed data, test data removal |
| HUB-54 | Verified Backend Unreachable-UI | 🟦 | Part of QA | - | Error handling, offline states, resilience verification |
| HUB-55 | End-to-End Verification of the App Part 1 | 🟦 | Part of QA (HUB-56) | - | E2E user flow testing (checkout, orders, payments) |
| HUB-56 | End-to-End Verification of the App Part 2 | 🟦 | Part of QA (HUB-56) | - | E2E admin flow testing, multi-role verification |
| HUB-57 | Merge all worktree to Master | 🟦 | CI/CD (HUB-32, Module 08) | - | Git workflow, PR review, merge to main; production readiness gate |

---

## MODULE 07: DESIGN SYSTEM & UI FOUNDATION

**Status:** 🟦 Planned (no work started)

| HUB | Lesson | Status | Planned Unit | Notes |
|-----|--------|--------|--------------|-------|
| HUB-58 | Get Design System | 🟦 | Part of storefront build | UI kit, component library, design tokens |
| HUB-59 | Building Design System Component reference sheet | 🟦 | Part of storefront + admin | Component library documentation, usage guide |
| HUB-60 | Brand Identity | 🟦 | Design phase | Logo, color palette, typography, brand guidelines |
| HUB-61 | Complete Ecommerce Platform UI Build | 🟦 | Storefront + admin UI | Full UI implementation for all pages and flows |

---

## MODULES 08-12: LESSON CONTENT AWAITING INSTRUCTOR

**Module 08: SECURITY, TESTING, DEPLOYMENT & OPERATIONS**
- Lesson content not yet provided by instructor
- Existing work: HUR-51 (CI/CD, Observability, Security Baseline) ✅
- Will be mapped once lesson list is published

**Module 09: MOBILE APP FOUNDATION & SHELL**  
**Module 10: MOBILE SHOPPING & DISCOVERY**  
**Module 11: MOBILE CHECKOUT, ORDERS & ACCOUNT**  
**Module 12: PUBLISHING, ROADMAP & WRAP-UP**

- Lesson content not yet provided by instructor
- Will be scoped and planned once modules are published

---

## KNOWN-GOOD CHECKPOINTS

| Checkpoint | Date | HUB Range | Status |
|------------|------|-----------|--------|
| `known-good-m1` | 2026-08-23 | HUB-1-3, HUB-11, HUB-22, HUB-44 (partial) | M1 foundation verified (scaffold, DB, auth, i18n) |
| `known-good-m2-u5` | 2026-08-23 | HUB-25 | Module 04 Product Catalog data layer verified |

---

## NEXT LESSON TO IMPLEMENT

**HUB-26: Brand Management (Module 04)**

**Rationale:**
- Next in curriculum order after HUB-25 ✅
- Depends on database schema ✅ and Product API ✅
- Prerequisite for storefront filtering (HUB-34)
- Moderate scope: data model + API + seed data

**Acceptance Criteria:**
1. Prisma `Brand` model created with attributes (name, logo_url, description)
2. Database migration applied
3. Seed data populated with real brands from existing products
4. API endpoint: `GET /api/brands?search=...&limit=...` with filtering
5. Zod validation for query parameters
6. TypeScript strict type safety
7. Unit tests covering list, filtering, edge cases (≥80% coverage)
8. Security review: input validation, no SQL injection
9. Production build passes
10. All tests pass

---

## EXECUTIVE SUMMARY

| Metric | Value |
|--------|-------|
| Total HUBs (Modules 01-07) | 61 |
| HUBs Completed | 7 (HUB-1-3, HUB-11, HUB-22, HUB-25) |
| HUBs In Progress | 0 |
| HUBs Planned | 54 |
| HUBs Escalated | 0 |
| Last Checkpoint | known-good-m2-u5 (HUB-25) |
| Current Position | End of HUB-25; ready for HUB-26 |
| Next Lesson | HUB-26 (Brand Management) |
| Blockers | None |
| Conflicts | None — curriculum aligned with PRD and dependencies |

---

**Organized by:** Curriculum hierarchy (Module → Lesson → HUB → Implementation Units)  
**Authority:** Instructor's 12-module roadmap + PRD v4 + existing verified work  
**Status:** Ready for autonomous HUB-26 implementation
