# Storefront Agent — Durable Learnings

## Tailwind v4 base-shade brand colors fail AA text contrast on dark backgrounds

**Symptom:** A brand color shade (e.g. blue-600 `#1D4ED8`) that passes WCAG AA
(6.7:1) as text on a white background drops to ~2.95:1 — well below the
4.5:1 text threshold — when used as text directly on a dark-mode background
(`#0a0a0a`). The same shade is fine when used as a _filled_ button
background with white foreground text in both modes (contrast is computed
against the fill, not the page background).

**Cause:** A single "primary-600" hex value cannot simultaneously satisfy
AA for (a) white-text-on-primary-fill and (b) primary-text-on-page-background
in both light and dark themes — the luminance math doesn't work out for one
mid-tone hex against both a near-white and a near-black background.

**Rule going forward:** Define two token families per brand color: one for
_fills_ (`--color-primary`, paired with `--color-primary-foreground`,
constant across themes since it's self-contained) and one for _text/icon_
usage (`--color-primary-text`), which must be swapped to a lighter shade
(e.g. `-400`) under `@media (prefers-color-scheme: dark)`. Always verify
every color pairing with the actual relative-luminance formula (not just
"this shade is commonly cited as accessible") against both the light and
dark background hex values in use — a Node one-liner is faster and more
reliable than eyeballing it. Decorative/low-emphasis borders (card dividers)
are exempt from the 3:1 UI-component rule, but _interactive component
boundaries_ (input fields, focus rings) are not — give those their own
dedicated token (`--color-input-border`) verified at >=3:1 against both
themes, separate from the decorative `--color-border`.
