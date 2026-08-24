# HurbadHardware Autonomous Engineering Team

This document describes the multi-agent system that builds HurbadHardware — a bilingual East African electronics e-commerce platform — from `docs/plans/PRD.md` v4, autonomously, with bounded iteration and machine-checked exits.

## How It Works

The system runs in a loop over a work ledger (`FEATURES.md`). For each ledger item, specialist agents are dispatched in dependency order; each verifies its own work locally before handing off; a Production-Readiness gate runs the real build/lint/test/dogfood/security commands and only marks an item "verified" when every one of them exits 0. Items that can't get there within bounded retries are escalated, never silently abandoned.

This is **bounded autonomy with machine-checked exits** — not infinite unattended running. See `.claude/commands/hurbad-team.md` for the exact loop mechanics.

## The Roster

| Agent                       | File                                          | Role                                     | Owns (PRD Units)                           | Tools          |
| --------------------------- | --------------------------------------------- | ---------------------------------------- | ------------------------------------------ | -------------- |
| `product-planning`          | `.claude/agents/product-planning.md`          | Ledger owner, feature framer             | FEATURES.md, acceptance criteria           | Read-only      |
| `architect`                 | `.claude/agents/architect.md`                 | Schema & adapter design authority        | `prisma/schema.prisma`, adapter interfaces | Read+Edit+Bash |
| `auth-platform`             | `.claude/agents/auth-platform.md`             | Foundation, auth, i18n                   | U1, U2, U3, U4                             | Read+Edit+Bash |
| `storefront`                | `.claude/agents/storefront.md`                | Catalog, search, SEO                     | U5, U6, U7, U8, U20                        | Read+Edit+Bash |
| `commerce-engine`           | `.claude/agents/commerce-engine.md`           | Cart, checkout, pricing, FX              | U9, U10, U11, U22                          | Read+Edit+Bash |
| `payment-gateways`          | `.claude/agents/payment-gateways.md`          | Payment adapters, reconciliation         | U12, U23                                   | Read+Edit+Bash |
| `customer-experience`       | `.claude/agents/customer-experience.md`       | Accounts, notifications, WhatsApp        | U14, U15, U16                              | Read+Edit+Bash |
| `admin-ops`                 | `.claude/agents/admin-ops.md`                 | Product/inventory/order admin, analytics | U17, U18, U19                              | Read+Edit+Bash |
| `performance-deployment`    | `.claude/agents/performance-deployment.md`    | Performance, PWA, CI/CD                  | U21                                        | Read+Edit+Bash |
| `security-reviewer`         | `.claude/agents/security-reviewer.md`         | Diff security review                     | Cross-cutting                              | Read-only      |
| `qa-test`                   | `.claude/agents/qa-test.md`                   | Test suite, dogfood entrypoint           | Cross-cutting                              | Read+Edit+Bash |
| `production-readiness-gate` | `.claude/agents/production-readiness-gate.md` | Final verification gate                  | Cross-cutting                              | Read-only+Bash |

**Least-privilege tools:** Reviewers (`product-planning`, `security-reviewer`) and the gate get read-only or read+bash access — they never edit code. Builders get `Read`, `Edit`, `Bash`, `Glob`, `Grep`.

## The Milestone Plan

| Milestone | Units         | Goal                      | Integration Checkpoint                                                                   |
| --------- | ------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| **M1**    | U1–U4         | Foundation, auth, i18n    | Build/typecheck/lint green; auth flow works; `/so/` renders in Somali                    |
| **M2**    | U5–U8, U20p   | Catalog & discovery       | Search works; JSON-LD present; sitemap valid; Rich Results Test passes                   |
| **M3**    | U9–U10        | Cart & wishlist           | Guest cart persists; login merges cart; coupon validates                                 |
| **M4**    | U22, U11      | Pricing & checkout        | FX cached; order created atomically; no client price manipulation                        |
| **M5**    | U12, U23      | Payments & reconciliation | All 4 gateways initiate + confirm via status query; dropped callback recovers via cron   |
| **M6**    | U14–U16       | Accounts & WhatsApp       | Dashboard works; WhatsApp bot creates orders; notifications sent                         |
| **M7**    | U17–U19, U21p | Admin & launch readiness  | Admin CRUD works; analytics correct; Lighthouse ≥85; **dogfood exits 0**; security green |

Each milestone ends with an **Integration Checkpoint**: re-ground against the North Star, run the full-system dogfood, and either tag `known-good-m<N>` (on green) or roll back to `known-good-m<N-1>` (on red).

## The Loop Contract (Summary)

- **CONTINUE** an item while: unmet criteria remain AND last cycle made progress AND `iterations < 8` AND under budget.
- **VERIFY** only when production-readiness-gate returns all-green by exit code: build, lint, typecheck, test+coverage≥80%, dogfood, security.
- **ESCALATE** (never spin silently) when: max iterations hit, budget exhausted, 2 consecutive no-progress cycles (thrash), same root cause fails twice, or the change touches money/PII/data-integrity/secrets unsafely.
- **STOP THE RUN** when the ledger is clear, everything remaining is escalated, or the run-horizon (8h) is hit — in the last case, checkpoint and write a resume note.

Full mechanics: `.claude/commands/hurbad-team.md`.

## The Self-Learning Loop

Each agent has a learnings file at `docs/agents/learnings/<name>.md`:

- **Before** a task: read it, apply every relevant entry.
- **After** a task: append durable lessons only (format: Symptom / Cause / Rule), never task-specific trivia, never secrets.

Each ledger item's retro (run by the orchestrator):

1. Confirms learnings files were updated.
2. **Promotes** any learning that recurred ≥2 times or prevented an iron-rule violation into the agent's charter itself, in a capped "Promoted Learnings" section (~1 page, curated on promotion — merge duplicates, drop stale entries).
3. **Audits the greens** — once per milestone, spot-checks one item that passed the gate to verify its tests are meaningful and its claims were grounded, not just confidently asserted.

This is how the team gets measurably better each run, not just busier.

## Durable Run State

`docs/agents/run-state.md` is the team's memory across context resets — distinct from per-agent learnings (which are reusable lessons; run-state is the live decision log for this specific build).

- **Tier 1 (top, ~1 page):** North Star, milestone position, active decisions still in force, last known-good checkpoint, open risks. Every agent reads this on wake.
- **Tier 2 (below, append-only):** Dated decision log with rationale and alternatives rejected. Read only on demand.

## Iron Rules (from PRD §0.5 / §52 — Never Weakened)

1. Client input is never trusted for price, stock, tax, shipping, or payment success.
2. Payment success is server-authoritative (status query, never callback-alone).
3. Inventory cannot oversell under concurrency.
4. Historical orders are immutable snapshots.
5. Admin authorization is enforced server-side.
6. Sensitive data is never publicly exposed.
7. Third-party providers are isolated behind adapters.
8. Webhooks are authenticated, deduplicated, and idempotent.
9. Business rules are never guessed — missing decisions are surfaced, not invented.
10. Production launch requires all critical gates to pass.

## How to Invoke

```
/hurbad-team
```

This resumes from `docs/agents/run-state.md` Tier 1 — there is no separate "fresh start" mode. To restart the run, edit run-state.md's current position manually first.

## What This System Deliberately Does NOT Do

- No unbounded agent spawning — the roster is fixed at 12; no agent spawns sub-agents.
- No freeform charter self-rewriting — the only path to changing a charter is the gated retro promotion (Step 6 of the orchestrator).
- No multi-agent debate loops — the gate's exit codes are the arbiter, not agent consensus.
- No broad tool grants "to be safe" — every agent's tools are the minimum for its role.
- No new roles added without an unowned real risk from Phase 0 driving the addition.
