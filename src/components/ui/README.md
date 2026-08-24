# HurbadHardware UI Design System (HUB-20)

Foundation-layer design tokens + base component primitives. Storefront/cart/
admin pages (M05-M07) build on this layer — they are **not** part of this
unit.

## Tokens (`src/app/globals.css`)

All tokens are Tailwind v4 CSS-first `@theme` variables — no
`tailwind.config.js` (v4 doesn't use one). Raw hex values live on `:root`
(light mode) and are overridden inside `@media (prefers-color-scheme: dark)`;
`@theme inline` maps them to utility-generating variables.

### Color

| Token                                               | Usage                                                                                         | Light contrast    | Dark contrast                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `--color-primary` (600) / `bg-primary`              | Filled brand surfaces (primary Button)                                                        | white text 6.70:1 | white text 6.70:1                                                               |
| `--color-primary-text`                              | Brand-colored **text/icons** (links)                                                          | 6.70:1 on white   | swaps to primary-400, 7.79:1 on `#0a0a0a`                                       |
| `--color-secondary` (600 teal)                      | Filled secondary surfaces                                                                     | white text 5.47:1 | white text 5.47:1                                                               |
| `--color-secondary-text`                            | Secondary-colored text                                                                        | 5.47:1 on white   | swaps to secondary-400, 10.64:1 on dark                                         |
| `--color-success` / `-warning` / `-error` / `-info` | Semantic status (badges, alerts, form validation)                                             | >=4.83:1 on white | swaps to lighter `-dark` shade with black-ish foreground, >=7.16:1 on `#0a0a0a` |
| `--color-border`                                    | Decorative dividers (cards, sections) — not a WCAG 1.4.11 UI-boundary, low-contrast by design | —                 | —                                                                               |
| `--color-input-border`                              | Form-control boundaries (Input, Select) — must be >=3:1                                       | 4.83:1 on white   | 4.10:1 on `#0a0a0a`                                                             |
| `--color-muted` / `--color-muted-foreground`        | Subtle backgrounds / secondary text                                                           | 4.83:1            | 7.72:1                                                                          |

Rule of thumb: use `bg-primary`/`bg-secondary` (+ their `-foreground` token)
for **filled** elements; use `text-primary-text`/`text-secondary-text` for
**text-on-page** usages, since the base 600 shade fails AA text contrast on
the dark background — the dark-mode override handles the swap automatically.

All ratios computed with the standard WCAG relative-luminance formula against
`#ffffff` (light) and `#0a0a0a` (dark, matching the existing `--background`
tokens).

### Typography

`--text-xs` (12px) through `--text-4xl` (36px), each with a paired
`--text-*--line-height`. Font weights: `--font-weight-normal` (400),
`-medium` (500), `-semibold` (600), `-bold` (700). Font family is unchanged
(Geist, already wired via `--font-sans`/`--font-mono`).

### Spacing

Not redefined — Tailwind v4's default `--spacing: 0.25rem` (4px) scale
already satisfies the AC. Use `p-*`, `m-*`, `gap-*`, `space-*` utilities;
avoid arbitrary values (`p-[13px]`) in new components.

## Components (`src/components/ui/`)

- `button.tsx` — `Button`. Props: `variant` (`primary | secondary |
destructive | outline | ghost`, default `primary`), `size` (`sm | md | lg |
icon`, default `md`), plus all native `<button>` attributes.
- `input.tsx` — `Input`. Props: `error?: boolean` (switches border/focus
  ring to `--color-error`), plus all native `<input>` attributes.
- `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`,
  `CardContent`, `CardFooter` — composable sub-parts, each a thin
  token-driven `<div>` wrapper.

All three are plain server-renderable components (no `"use client"` — they
hold no state/handlers themselves; consumers add interactivity). They use
`cn()` from `src/lib/cn.ts` (a tiny local className joiner — no
`clsx`/`tailwind-merge` dependency was added) so callers can override/extend
classes via the `className` prop.

`src/components/language-switcher.tsx` was **not** refactored to use these
tokens/primitives in this unit (out of scope, see HUB-20 AC5) — it still
uses ad-hoc `zinc-*`/`blue-*` values. Future work replacing it should adopt
the primitives above.
