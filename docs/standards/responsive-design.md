# Responsive Design Standards — HurbadHardware

**Owner:** storefront agent (HUB-23). **Status:** Convention + foundational-page
verification only. Full storefront-page (catalog/PDP/cart/checkout) responsive
verification is **deferred to Module 05** (HUB-33-43) — see Section 4.

**Baseline:** mobile-first, built on Tailwind v4's default breakpoint scale
(unmodified in this project).

---

## 1. Breakpoint Scale

`src/app/globals.css` was read in full for this document. It defines color,
typography, and spacing tokens (HUB-20) but contains **no `@theme` breakpoint
override** — no `--breakpoint-*` variables are declared anywhere in the
codebase (confirmed via search). Tailwind v4's default breakpoint scale is
therefore in effect, unmodified:

| Prefix   | Min width | Typical device class                            |
| -------- | --------- | ----------------------------------------------- |
| _(none)_ | 0px       | Mobile (base/unprefixed styles — see Section 2) |
| `sm:`    | 640px     | Large phone (landscape) / small tablet          |
| `md:`    | 768px     | Tablet                                          |
| `lg:`    | 1024px    | Small laptop / tablet landscape                 |
| `xl:`    | 1280px    | Desktop                                         |
| `2xl:`   | 1536px    | Large desktop                                   |

Do not introduce a custom `@theme { --breakpoint-* }` override without
updating this table — the whole app currently assumes the stock scale.

---

## 2. Mobile-First Authoring Convention

**Base (unprefixed) Tailwind classes are the mobile styles.** Prefixed
variants (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) progressively **enhance** the
layout for larger viewports. This is the only authoring direction used in
this codebase — it must remain the only direction going forward.

```
<!-- Correct: mobile-first -->
<div class="flex flex-col gap-4 sm:flex-row sm:gap-6">

<!-- Wrong: desktop-first with max-* overrides. Do not do this. -->
<div class="flex flex-row gap-6 max-sm:flex-col max-sm:gap-4">
```

Rules:

- Write the narrowest/simplest layout first with no prefix, then layer on
  `sm:`/`md:`/`lg:`/`xl:` utilities to change layout as the viewport grows.
  Never write a desktop layout as the default and claw it back for mobile
  with `max-*:` variants — this is backwards from Tailwind's own convention,
  harder to reason about, and not how any existing page in this repo is
  built (see `src/app/[locale]/page.tsx`, `.../account/page.tsx`,
  `.../admin/page.tsx`, all of which are unprefixed-base → `sm:`/`lg:`
  enhancement, confirmed while auditing this codebase for HUB-23).
- Test/reason about a component at its base (mobile) styles first, then
  verify each added breakpoint prefix independently — do not assume a
  desktop-looking layout "just works" on mobile because no errors are
  thrown; Tailwind will happily apply desktop-sized paddings/flex-rows at
  320px if you forget the mobile-first base classes.
- `flex-wrap` / `flex-col` → `sm:flex-row` (or similar) is the standard
  pattern for a horizontal toolbar/header that must not collide on narrow
  viewports (see Section 3.5's admin header fix for a concrete example).

---

## 3. Layout Patterns

### 3.1 Stacking → grid/flex reflow

The dominant pattern already used across the codebase: elements that sit
side-by-side on wider viewports stack vertically on mobile, using
unprefixed `flex-col` (or a single-column grid) as the base and a
`sm:`/`lg:` prefix to switch to a row/grid layout. Examples already in the
codebase:

- `src/app/[locale]/page.tsx`: hero CTA buttons are `flex-col` (stacked,
  full-width `w-full`) at the base, `sm:flex-row` (side-by-side, fixed
  `md:w-[158px]`) from `sm:` up.
- `src/app/[locale]/admin/page.tsx`: the three dashboard cards use
  `grid-cols-1` at the base (stacked), `sm:grid-cols-2`, `lg:grid-cols-3`
  (reflow into a 2-then-3-column grid as width grows).

Future Module 05 storefront pages (product grid, filter sidebar, cart line
items) must follow the same pattern: single-column stack as the mobile
base, reflow to grid/sidebar layouts only from `sm:`/`md:`/`lg:` up. A
filter sidebar in particular should default to an off-canvas/collapsed
pattern on mobile (base styles) and only become a permanently-visible
inline sidebar at `lg:` — do not ship a fixed-width sidebar with no mobile
base case.

### 3.2 Safe-area / edge spacing

Pages that run full-height/full-width (auth pages, dashboards) use
horizontal padding on the outermost container to keep content off the
viewport edge on mobile — e.g. `px-4` (16px) as the base, widening to
`sm:px-6 lg:px-8` on larger viewports (see `account/page.tsx` and
`admin/page.tsx`'s `<main>` elements). This is the standard edge-spacing
convention going forward: never let content touch the viewport edge at
320-414px widths; `px-4` is the minimum base horizontal padding for any
new top-level page container.

### 3.3 Touch-target minimum

See `docs/standards/accessibility.md` Section 8 (WCAG 2.5.8) for the
24×24 CSS px minimum tap-target audit and computation method. Any new
mobile layout must keep interactive elements at or above this size —
responsive reflow must not shrink a button/link below the audited minimum
at any breakpoint.

### 3.4 Horizontal scroll is always a bug

No page in this codebase should ever produce horizontal scroll at any
viewport width from 320px up. If a fix requires trading off content width,
prefer wrapping/stacking (Section 3.1) or `min-w-0` + `truncate` on flex/grid
children over allowing overflow-x. `overflow-x-auto` is only acceptable for
an intentionally horizontally-scrollable region (e.g. a future horizontal
product carousel), never as a workaround for a layout that doesn't fit.

### 3.5 Worked example: admin dashboard header (fixed under HUB-23)

`src/app/[locale]/admin/page.tsx`'s header originally used
`flex justify-between items-center` with no wrap on the container holding
the "Admin Dashboard" title (`text-3xl font-bold`) and the "Sign Out"
button. At 375px width, the Somali translation of the title
("Dashboard-ka Maamulaha", 23 characters at 30px/bold) does not fit
alongside the button in the ~343px of available width after the page's
`px-4` edge padding — this violated Section 3.1's stacking convention (the
header had no mobile base case, only a single row layout at all widths).
Fixed by adding `flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`
so the title stacks above the button on mobile and reflows to a single row
from `sm:` (640px) up, matching every other multi-element toolbar in this
codebase.

---

## 4. Module 05 Deferral

Per the same re-scope pattern documented in
`docs/standards/accessibility.md` Section 9: **catalog, product detail,
cart, and checkout pages do not exist yet** (Module 05, HUB-33-43, is
blocked on Modules 02-03). This document establishes the breakpoint
convention and layout patterns those pages must follow when built, but
does **not** itself verify or build any storefront page. The following are
explicitly deferred and must be picked up as part of Module 05 acceptance
criteria, not assumed complete:

- Product grid / filter sidebar responsive behavior (mobile off-canvas
  filters, grid column counts per breakpoint).
- Product detail page image gallery / variant selector mobile layout.
- Cart drawer / checkout form mobile layout, including safe-area handling
  for fixed bottom action bars (e.g. sticky "Add to Cart" / "Place Order").
- Lighthouse mobile performance/UX score gate on any storefront page.

## 5. HUB-23 Scope Covered By This Document

This document, together with the Section 8 touch-target table extension in
`docs/standards/accessibility.md` and the page-by-page verification below,
constitutes HUB-23 (Mobile Experience). Pages verified at 375px/414px:
`src/app/[locale]/page.tsx`, `src/app/[locale]/auth/signin/page.tsx`
(+ `signin-form.tsx`), `src/app/[locale]/auth/register/page.tsx`
(+ `register-form.tsx`), `src/app/[locale]/account/page.tsx`,
`src/app/[locale]/admin/page.tsx`. `src/app/page.tsx` (root boilerplate) was
explicitly **excluded** — `src/proxy.ts` sets `localePrefix: "always"`,
so `/` always redirects into a `[locale]`-prefixed route and the root page
is unreachable in practice; verifying it would test dead code.

Verification method: no browser/preview tool was available in this session,
so verification was done via careful manual reasoning about the Tailwind
classes actually applied at each breakpoint, cross-referenced against the
actual EN and SO string lengths pulled from `src/messages/en.json` /
`src/messages/so.json` for the one page (admin dashboard) where text length
was long enough to plausibly cause a collision. All findings and the one
fix applied are recorded in Section 3.5 above.
