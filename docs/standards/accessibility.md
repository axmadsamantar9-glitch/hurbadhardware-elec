# Accessibility Standards — HurbadHardware

**Owner:** storefront agent (HUB-21). **Status:** Foundations only — full
audit of catalog/PDP/checkout is deferred until those pages ship (Module
05). This document sets the conventions those future builders must follow
so a11y is correct on first implementation, not retrofitted.

**Baseline:** WCAG 2.2 Level AA.

---

## 1. Keyboard Navigation & Focus

### 1.1 Focus-visible ring (from HUB-20 design system)

Every interactive element must show a visible focus indicator on keyboard
focus (not on mouse click) using the shared token pattern already defined
on `Button` and `Input` (`src/components/ui/button.tsx`,
`src/components/ui/input.tsx`):

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
```

- Use `focus-visible:ring-primary` for default state, `focus-visible:ring-error`
  when the control is in an error state (see `Input`'s `error` prop).
- Inside a bounded container (e.g. a dropdown menu item where an outer ring
  would be clipped or overlap a sibling), use `focus-visible:ring-inset`
  instead of `ring-offset-2` (see `LanguageSwitcher` menu items in
  `src/components/language-switcher.tsx`).
- Do **not** use `focus:` (fires on any focus, including mouse clicks) —
  always use `focus-visible:` so mouse users don't see rings on click.
- Never set `outline: none` / `focus-visible:outline-none` without pairing
  it with a `ring-*` replacement. A focus indicator must always be present.

### 1.2 Tab order

- Rely on native DOM order for tab order; do not use positive `tabIndex`
  values. Use `tabIndex={-1}` only for programmatically-focusable elements
  that should not be in the natural tab sequence.

### 1.3 Focus-trap / focus-return pattern (dropdowns, modals)

Reference implementation: `src/components/language-switcher.tsx`. Any
future dropdown, popover, or modal (variant selector, filter panel, cart
drawer, mobile nav, comparison modal) must follow this pattern:

1. **Trigger button**: `ref` it (`triggerRef`), set `aria-haspopup` to the
   appropriate value (`"menu"`, `"dialog"`, `"listbox"`) and
   `aria-expanded={isOpen}`.
2. **Container**: give it the matching role (`role="menu"` for menus,
   `role="dialog"` + `aria-modal="true"` for modals) and `ref` it
   (`menuRef`/`dialogRef`).
3. **Escape closes**: a `document`-level `keydown` listener (added only
   while open, removed on close/unmount) that calls a single `closeMenu`
   function on `Escape`.
4. **Click-outside closes**: a `document`-level `mousedown` listener that
   closes when the click target is outside both the trigger and the
   container refs.
5. **Focus return**: `closeMenu` always accepts a `returnFocus: boolean`
   argument. Keyboard-initiated closes (Escape, item selection) return
   focus to the trigger via `triggerRef.current?.focus()`. Outside-click
   closes do not force focus (the user's click already moved focus
   elsewhere).
6. **True focus trap** (modals only, not simple menus): while open, `Tab`
   at the last focusable element cycles to the first, and `Shift+Tab` at
   the first cycles to the last. Not required for simple dropdown menus
   where Tab is allowed to leave the menu and close it naturally — only
   required for modal dialogs (cart drawer, image lightbox, checkout
   overlays) where content behind the modal must not be reachable.

---

## 2. ARIA Labeling Conventions

- **Icon-only buttons** (e.g. `Button` with `size="icon"`, cart icon,
  search icon, close buttons): must have `aria-label` describing the
  action (e.g. `aria-label="Close"`, not `aria-label="X"`). Decorative
  icons inside a button that already has visible text must get
  `aria-hidden="true"` on the `<svg>` (see the chevron icon in
  `LanguageSwitcher`).
- **Toggle/disclosure buttons** (dropdown triggers, accordions, filter
  section headers): `aria-expanded={boolean}` reflecting open state, plus
  `aria-haspopup="menu"` (for menus) or `aria-controls="<id-of-panel>"`
  where a stable id is available.
- **Menus**: container gets `role="menu"`; each actionable child gets
  `role="menuitem"`. Menu items remain real `<button>` elements (natively
  keyboard-operable) with the role layered on top, not `<div role="button">`.
- **Form fields**: every `Input` must have an associated `<label>` (see
  Section 4 for how label association works with the `Input` primitive).
- **Landmark regions**: use native elements (`<nav>`, `<main>`, `<header>`,
  `<footer>`) over ARIA landmark roles where possible; only add
  `role="search"` etc. when no native element covers the semantic.

---

## 3. `aria-live` Regions for Dynamic Content

These four cases are explicitly in scope for future M05/M07 builders.
Get the `aria-live` politeness level right the first time — retrofitting
live regions after a page ships is easy to get wrong (e.g. re-mounting the
live region container itself, which resets it and loses the announcement).

| Dynamic content                                                                               | Politeness                                                                                                                                                                                                                                                             | Rationale                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cart badge count** (header cart icon showing item count)                                    | `aria-live="polite"` on a visually-hidden or visible text node wrapping the count, `aria-atomic="true"`                                                                                                                                                                | Not urgent enough to interrupt; announce "Cart, 3 items" after the count settles, not per-click during rapid add-to-cart taps.                                                                                                                                                                                         |
| **Filter result counts** ("42 results") on the product listing sidebar                        | `aria-live="polite"`, `aria-atomic="true"`, and debounce the DOM update to match the debounce already used for the filter query itself — do not fire a screen-reader announcement per keystroke, only once results settle                                              | Same as above: informational, not interrupting.                                                                                                                                                                                                                                                                        |
| **Variant price changes** (PDP: selecting a size/color updates displayed price)               | `aria-live="polite"` on the price element itself, `aria-atomic="true"` so the whole new price string is read as one unit                                                                                                                                               | Direct result of user action; user should hear the new price without losing their place, but not urgent enough for `assertive`.                                                                                                                                                                                        |
| **Payment-status polling** (checkout: "Processing…" → "Payment confirmed" / "Payment failed") | `aria-live="assertive"`, `aria-atomic="true"` on the status container; the container element itself must exist in the DOM **before** polling starts (do not conditionally mount/unmount the live-region wrapper based on status — only its text content should change) | The one case where interruption is warranted: the user is mid-transaction and must not miss a failure state. Mounting/unmounting the container instead of updating its text is the most common live-region bug — screen readers only announce updates to a live region that was already present when the update fires. |

General rule: prefer a single persistent live-region container per dynamic
surface (rendered once, always in the DOM, content swapped via state) over
conditionally rendering the container itself.

---

## 4. Form Label Association Convention

`src/components/ui/input.tsx`'s `Input` primitive does **not** manage its
own `<label>` — it is a thin wrapper around a native `<input>` and accepts
arbitrary `InputHTMLAttributes`, including `id`. The convention going
forward:

- Callers must render a sibling `<label htmlFor="<id>">` and pass the
  matching `id` prop to `<Input id="<id>" ... />`. There is no implicit
  label wiring inside the primitive.
- If a visible label is not appropriate (e.g. a compact inline search box
  where the placeholder communicates purpose), use `aria-label` on the
  `Input` directly rather than omitting labeling entirely. Placeholder
  text alone is never sufficient (WCAG 3.3.2 / 1.3.1).
- Error messaging: pass `error` to switch `Input`'s border/ring to the
  error token, and additionally render the error text with
  `id="<field>-error"` and set `aria-describedby="<field>-error"` on the
  `Input` (not currently automated by the primitive — caller-supplied;
  document here so M05 forms (checkout address, payment) do this
  consistently).

This convention is documented here (rather than changing the `Input`
primitive to force an internal label) to keep `Input` composable — some
usages (icon-adorned search bars, inline table-cell edits) do not want a
component-managed label wrapper.

---

## 5. Alt-Text Requirements for Product Imagery

(Applies to the future PDP/gallery/grid work in M04/M05, enforced now by
`jsx-a11y/alt-text` and `jsx-a11y/img-redundant-alt`, see Section 7.)

- **Primary product image** (grid thumbnail, PDP hero): `alt` must contain
  the product name at minimum (e.g. `alt="Samsung 55-inch 4K Smart TV"`),
  not a generic `alt="product image"`.
- **Gallery/secondary images** (additional angles, in-context photos):
  `alt` should differentiate the shot (e.g. `alt="Samsung 55-inch 4K Smart
TV — rear panel ports"`), not repeat the primary alt verbatim for every
  thumbnail.
- **Decorative images** (background textures, spacer graphics): `alt=""`
  (empty, not omitted — omitting `alt` entirely is a violation; an empty
  string explicitly tells assistive tech to skip it).
- **Do not** put the word "image" or "picture" in the alt text
  (`jsx-a11y/img-redundant-alt` flags this) — screen readers already
  announce `<img>` elements as images.
- Category/brand logos used as links: `alt` describes the destination
  ("Samsung", not "Samsung logo").

---

## 6. EN/SO Bilingual Considerations

- **`lang` attribute**: the root `<html lang="...">` must switch with the
  active locale (`en` / `so`) on every locale-prefixed route. This is
  already handled by the `[locale]` routing segment
  (`src/app/[locale]/layout.tsx`) via `next-intl` — future pages must not
  hardcode `lang="en"` anywhere or override it per-component.
- **Directionality**: Somali is Latin-script, left-to-right, identical
  writing direction to English. **No `dir="rtl"` handling is needed**
  anywhere in the app — do not add RTL-specific CSS logical-property
  workarounds speculatively; they are unnecessary complexity for this
  language pair. Revisit only if a future RTL locale is added.

---

## 7. Automated Tooling: `eslint-plugin-jsx-a11y`

`eslint.config.mjs` wires in `jsx-a11y`'s **strict** flat-config ruleset
(`jsxA11y.flatConfigs.strict.rules`) as `error` (not `warn`) for all
`.{js,jsx,ts,tsx}` files, superseding the handful of `warn`-level jsx-a11y
rules bundled by default inside `eslint-config-next`. This gates every
future storefront/checkout PR — a violation fails `npm run lint` (exit
non-zero), which is part of CI/the pre-commit `lint-staged` hook.

One rule is disabled with a documented reason:

- `jsx-a11y/media-has-caption`: off. No `<video>`/`<audio>` components
  exist yet anywhere in the app. Re-enable (remove the override) the
  moment M05/M06 introduces any media component.

As of this document, `npm run lint` reports **0** `jsx-a11y/*` violations
across the full codebase (verified 2026-08-24; two pre-existing files with
`jsx-a11y/anchor-is-valid` violations — `src/app/[locale]/account/page.tsx`
and `src/app/[locale]/admin/page.tsx`, which used `<a href="#">` as
disabled placeholder links for not-yet-built dashboard routes — were fixed
by converting them to `<button type="button" disabled aria-disabled="true">`,
which is the correct semantic for a non-navigating, currently-unavailable
action).

---

## 8. WCAG 2.2 SC 2.5.8 Target Size (Minimum) Audit

SC 2.5.8 (Level AA) requires the size of the target for pointer inputs to
be at least 24×24 CSS px, unless an exception applies (inline text link,
essential, equivalent control available, or spacing exception — none of
the components below need an exception; they meet the minimum directly).

Tailwind v4's default spacing scale is used throughout (`--spacing: 0.25rem`
= 4px per unit, e.g. `h-8` = 2rem = 32px). Computed against the classes
actually applied in `src/components/ui/button.tsx` and
`src/components/language-switcher.tsx`:

| Component                         | Classes                                                      | Computed size                                                                                                                                                                                         | 24×24 min | Result                                                    |
| --------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| `Button` size `sm`                | `h-8 px-3`                                                   | 32px tall × (content + 24px horizontal padding) wide                                                                                                                                                  | 24px      | **PASS** (32px height alone clears the minimum)           |
| `Button` size `md` (default)      | `h-10 px-4`                                                  | 40px tall × (content + 32px horizontal padding) wide                                                                                                                                                  | 24px      | **PASS**                                                  |
| `Button` size `lg`                | `h-12 px-6`                                                  | 48px tall × (content + 48px horizontal padding) wide                                                                                                                                                  | 24px      | **PASS**                                                  |
| `Button` size `icon`              | `h-10 w-10`                                                  | 40px × 40px (fixed, both axes)                                                                                                                                                                        | 24×24px   | **PASS**                                                  |
| `LanguageSwitcher` trigger button | `px-3 py-2 text-sm` + `border` (1px)                         | Height: 2×8px padding (py-2) + 20px text-sm line-height + 2×1px border = 38px. Width: content-driven (locale code + gap-2 + 16px chevron icon + 2×12px padding), comfortably >24px for both "EN"/"SO" | 24×24px   | **PASS** (38px tall, content-driven width well over 24px) |
| `LanguageSwitcher` menu items     | `w-full px-4 py-2 text-sm` inside a `w-40` (160px) container | Height: 2×8px padding + 20px text-sm line-height = 36px. Width: 160px (full menu width)                                                                                                               | 24×24px   | **PASS**                                                  |

All audited HUB-20/HUB-21 interactive primitives meet the 24×24 CSS px
minimum with margin to spare. No remediation needed for this AC. Future
components (checkbox/radio inputs, close icons, star ratings, quantity
steppers in M05) must be checked against this table's method before
shipping — do not introduce a tap target smaller than `h-8`/`w-8` (32px)
without an explicit spacing-exception justification recorded here.

### 8.1 Raw HTML auth form controls (added HUB-23)

`src/app/[locale]/auth/signin/signin-form.tsx` and
`src/app/[locale]/auth/register/register-form.tsx` render plain `<input>`/
`<button>` elements directly (not the HUB-20 `Input`/`Button` primitives),
so they were out of scope for the original Section 8 audit above. Neither
file sets an explicit `text-*` size class on its inputs/buttons, so they
inherit the Tailwind v4 Preflight body default: 16px font-size, `1.5`
line-height → 24px computed line-height (matches this project's own
`--text-base--line-height: 1.5rem` token in `src/app/globals.css`).

| Component                                                     | Classes                             | Computed size                                                                                                                         | 24×24 min | Result   |
| ------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- |
| Email input (signin + register)                               | `w-full ... px-3 py-2 border` (1px) | Height: 2×8px padding (py-2) + 24px line-height + 2×1px border = 42px. Width: `w-full` (≈448px max-w-md container minus outer `px-4`) | 24×24px   | **PASS** |
| Password input (signin + register)                            | same as above                       | 42px tall × full container width                                                                                                      | 24×24px   | **PASS** |
| Confirm-password input (register only)                        | same as above                       | 42px tall × full container width                                                                                                      | 24×24px   | **PASS** |
| Submit button ("Sign In" / "Create Account")                  | `w-full ... px-4 py-2` (no border)  | Height: 2×8px padding + 24px line-height = 40px. Width: `w-full`                                                                      | 24×24px   | **PASS** |
| Google OAuth button ("Sign in with Google", signin form only) | `w-full ... px-4 py-2 border` (1px) | Height: 2×8px padding + 24px line-height + 2×1px border = 42px. Width: `w-full`                                                       | 24×24px   | **PASS** |

All raw HTML auth form controls meet the 24×24 CSS px minimum with no
remediation needed. Because every control here uses `w-full` inside a
`max-w-md` container, width is never the binding constraint — the padding

- line-height combination on the height axis is what was checked against
  the 24px floor, per the same method used in the table above. These
  controls should still be migrated to the HUB-20 `Input`/`Button`
  primitives when the auth forms are next touched, for consistency (not an
  accessibility blocker — tracked as a nice-to-have, not a gap).

---

## 9. Deferred Scope

Per the confirmed HUB-21 re-scope: the storefront/cart/checkout UI does
not exist yet (Module 05 blocked). The following are explicitly deferred
until those pages ship, and must be picked up as part of Module 05/07
acceptance criteria, not assumed complete:

- Full keyboard-only purchase flow audit (browse → cart → checkout → confirm).
- Catalog/PDP/checkout page-level automated + manual a11y audit (axe-core
  or equivalent, screen-reader smoke test).
- Screen-reader testing of the dynamic `aria-live` regions specified in
  Section 3 (they are documented here so they're built correctly the
  first time, but cannot be tested until the components exist).
- Lighthouse accessibility score gate on storefront pages.
