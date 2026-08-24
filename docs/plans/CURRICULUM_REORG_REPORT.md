# HurbadHardware — Linear Curriculum Reorganization: Final Report

Executed and verified 2026-08-22. Scope: Linear only — no application code, database schema, or migrations were touched.

---

## 1. What Was Corrected

- All 9 pre-existing Linear module projects renamed from the old internal 9-module taxonomy to the instructor's verified 12-module numbering/titles (see §4).
- Every issue that was in the wrong module under the new curriculum was re-parented (44 issues moved between projects), each carrying a "Module 0X Lesson: …" line added to its description so the mapping is visible on the issue itself, not just in this report.
- Old Linear Module 9 ("Launch & Future Improvements," 6 issues) had no instructor-numbered home — absorbed into the new Module 12 ("Publishing, Roadmap & Launch") as the closest confirmed semantic fit.
- Old Linear Module 3 ("Authentication & Authorization," 4 issues: `HUR-14, 52, 53` + parent `HUR-35`) had no confirmed instructor lesson anywhere — folded into Module 06's "Authentication and Customer Portal" lesson (the closest confirmed lesson name) rather than left orphaned, per your instruction to preserve real requirements even without a clean lesson match.
- `HUR-37` (Design System Foundation) physically relocated from old Module 5 into new Module 03; since it had been that project's parent epic, a new epic (`HUR-119`) was created so Module 07 didn't lose its container.

## 2. What Was Created (33 new issues + 3 new projects + 4 new epics)

- **3 new Linear projects**: Module 10 — Mobile Shopping & Discovery, Module 11 — Mobile Checkout, Orders & Payments, Module 12 — Publishing, Roadmap & Launch.
- **4 new parent epics**: `HUR-119` (Module 07, replacing HUR-37), `HUR-120` (Module 10), `HUR-121` (Module 11), `HUR-122` (Module 12).
- **9 new issues in Module 01** for the instructor's confirmed process lessons (Course Introduction, Tools, Install Claude Code Skills, Creating/Refining/Combining the PRD Plan, Creating a Linear Projects, Creating the DevOps Team, Timeline and Cost) — `HUR-123` through `HUR-131`.
- **2 new issues in Module 03**: Internationalization (`HUR-132`, no prior Linear issue covered EN/SO despite PRD R31 requiring it), Testing the Mobile App Experience (`HUR-133`).
- **1 new issue in Module 04**: Push the Project to Github Repository (`HUR-134`) — verified via `git remote -v` that no GitHub remote currently exists, so this is real outstanding work, not a formality.
- **4 new issues in Module 06**: SEO & Marketing (`HUR-135`), SEO Checklist (`HUR-136`) — both real gaps, no prior Linear issue covered PRD §8.4 SEO despite two instructor lessons naming it — plus Seed and Test Data Cleanup (`HUR-137`), Merge All Worktree to Master (`HUR-138`).
- **2 new issues in Module 07**: Building Design System Components (`HUR-139`), Brand Identity (`HUR-140`, no PRD content exists for visual brand identity — scoped minimally as a logo/color/typography usage guide).
- **16 new issues across Modules 09–11**, all PROJECT-PLANNED and clearly labeled as such (lessons not yet published by the instructor): Mobile Platform & Framework Decision (`HUR-141`, flagged as needing a business decision per PRD §1.3 which defers native apps in v1), Mobile Auth & Session Handling (`142`), Mobile Design-System Port (`143`), Mobile Navigation & Offline Handling (`144`); Mobile Catalog/Search/Product Detail (`145`), Mobile Cart & Wishlist (`146`), Mobile Product Comparison (`147`), Mobile Reviews (`148`); Mobile Checkout Flow (`149`), Mobile Payment Method Selection (`150`), Mobile Order Tracking & Notifications (`151`), Mobile WhatsApp Handoff (`152`).

## 3. What Was Merged/Consolidated

None. The original audit found zero exact duplicates across the 108-issue backlog, and re-verification during the reorg confirmed this — nothing was merged or canceled beyond the pre-existing (untouched) retired-module issues from the prior migration.

## 4. How Modules 01–12 Are Now Structured

| #   | Title                                                           | Status of lessons                                                                                                                     |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Foundation (Course Setup, PRD & Team Formation)                 | 🟢 Instructor-confirmed, 9 lessons + 8 business-decision-register issues kept as a labeled non-instructor sub-group                   |
| 02  | Architecture (System Design, Standards & Data Modeling)         | 🟢 Instructor-confirmed, 10 lessons                                                                                                   |
| 03  | Design System (UI Standards, Accessibility & i18n)              | 🟢 Instructor-confirmed, 5 lessons                                                                                                    |
| 04  | Catalog & Inventory                                             | 🟢 Instructor-confirmed, 8 lessons                                                                                                    |
| 05  | Storefront (Commerce, Checkout, Orders, Payments)               | 🟢 Instructor-confirmed, 11 lessons                                                                                                   |
| 06  | Admin, Portal, CMS & Analytics                                  | 🟢 Instructor-confirmed, 14 lessons                                                                                                   |
| 07  | Design System (Component Library, Brand Identity & Platform UI) | 🟢 Instructor-confirmed, 4 lessons                                                                                                    |
| 08  | Security, Testing & Deployment                                  | 🟡 Title confirmed, 4 lessons PROJECT-PLANNED (Security Hardening & Review, Automated Test Suites, Deployment & CI/CD, Documentation) |
| 09  | Mobile App Foundation                                           | 🟡 Title confirmed, 4 lessons PROJECT-PLANNED                                                                                         |
| 10  | Mobile Shopping & Discovery                                     | 🟡 Title confirmed, 4 lessons PROJECT-PLANNED                                                                                         |
| 11  | Mobile Checkout, Orders & Payments                              | 🟡 Title confirmed, 4 lessons PROJECT-PLANNED                                                                                         |
| 12  | Publishing, Roadmap & Launch                                    | 🟡 Title confirmed, absorbed 5 real launch-readiness issues from old Module 9                                                         |

## 5. How HUR-1 Through the Final Issue Are Organized

Linear does not support renaming issue identifiers, so `HUR-N` numbers remain historical/creation-order — this was flagged before execution and accepted as a hard platform constraint. What's gapless now is the **logical** structure: every issue belongs to exactly one of the 12 modules above, every issue's description states its lesson, no issue is orphaned outside the 12-module structure (aside from the pre-existing, intentionally-untouched `HUR-42` through `HUR-49` retired-module records from the prior migration, which remain Canceled and outside all 12 projects by design). Total: 152 issues across the 12 modules (108 original + 33 new + adjustments from parent-epic changes), verified via a live query after the reorg completed.

## 6. Issues Completed and Marked Done

Only 5, all independently verified against the real repository state, not assumed:

- `HUR-11` (Project Scaffolding) — pre-existing, unchanged.
- `HUR-12` (Database Schema & Migrations) — pre-existing, unchanged.
- `HUR-126` (Creating Complete PRD Plan) — newly marked Done; `docs/plans/PRD.md` verified present and complete.
- `HUR-129` (Creating a Linear Projects) — newly marked Done; this Linear project verifiably exists.
- `HUR-130` (Creating the DevOps Team) — newly marked Done; `.claude/agents/*.md` verified present (12 subagent definitions).

Every other issue — including all 33 newly created ones — remains Backlog. No status was inferred or assumed; per your instruction, nothing was marked Done for having its structure/description corrected alone.

## 7. Genuinely Unresolved Items

- **Module 08's real lesson list** is still unconfirmed — the 4 lessons I organized under it (Security Hardening & Review, Automated Test Suites, Deployment & CI/CD, Documentation) are my own inference from the title "Security, Testing, D…" and existing PRD-derived content, clearly labeled PROJECT-PLANNED in every relevant issue. If you can expand that module in the course app and share the real lesson names, I'll remap this one module without disturbing anything else.
- **Modules 09–12's lesson lists** are likewise PROJECT-PLANNED, as instructed — will need remapping once the instructor publishes real lessons, but are already isolated in their own projects so that remap will be contained.
- **Two imperfect fits, flagged in-issue rather than forced**: `HUR-81` (Return Requests) sits under "Repair Management" for lack of a cleaner instructor lesson; `HUR-29`/`HUR-90` (WhatsApp ordering) sit under Module 05's Checkout as an alternate channel, since no instructor lesson anywhere covers WhatsApp commerce.
- **Full instructor titles remain truncated** in every module name (e.g. "Module 01 — Foundation…") — I filled in plausible completions in parentheses, clearly distinguishable from the confirmed prefix, but haven't seen the untruncated originals.
- **Unrelated, still open**: the `.env.example` live-credential cleanup flagged earlier in this session — untouched, awaiting your go-ahead.

---

**Nothing here started implementation work.** Per your first instruction this session, U3 and all subsequent build work remain unstarted; this reorg only corrected where that future work will live in Linear.
