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

## eslint-config-next already bundles jsx-a11y at `warn`, not `error`

**Symptom:** Adding `eslint-plugin-jsx-a11y` and expecting `npm run lint`
to newly enforce a11y rules had no visible effect at first — the plugin
was already registered under the `jsx-a11y` namespace by
`eslint-config-next/typescript`'s underlying config.

**Cause:** `eslint-config-next` ships `eslint-plugin-jsx-a11y` as a
transitive dependency and registers it under the `plugins: { "jsx-a11y":
... }` key with only ~6 rules set to `"warn"` (alt-text, aria-props,
aria-proptypes, aria-unsupported-elements, role-has-required-aria-props,
role-supports-aria-props). Re-declaring `plugins: { "jsx-a11y": jsxA11y }`
in a second flat-config block throws `ConfigError: Cannot redefine plugin
"jsx-a11y"` (ESLint 9 flat config forbids re-registering the same plugin
key across config objects in the same array).

**Rule going forward:** When a plugin is already registered upstream
(check by grepping `node_modules/<upstream-config>/dist/*.js` for
`plugins:` and the plugin name before assuming it needs installing), add
only a **rules-only** flat-config block (no `plugins` key) that spreads
the plugin's own exported ruleset at the strictness you want, e.g.
`rules: { ...jsxA11y.flatConfigs.strict.rules }` placed _after_ the
upstream config in the array so it overrides the upstream `warn` defaults.
Still add the package as an explicit `devDependency` in `package.json`
even if already transitively present — pin it directly so a future
upstream major bump can't silently change/remove rules you depend on.

## Placeholder `<a href="#">` links for not-yet-built routes fail jsx-a11y/anchor-is-valid

**Symptom:** `src/app/[locale]/account/page.tsx` and `.../admin/page.tsx`
used `<a href="#">Go to Products</a>`-style stubs linking to
not-yet-built dashboard routes (Module 04/06 blocked). Turning on
`jsx-a11y/anchor-is-valid` (part of the strict ruleset) fails the build
on these.

**Cause:** `href="#"` is not a real navigable address; the rule correctly
flags it as an anchor masquerading as an interactive element with no
actual destination.

**Rule going forward:** For a placeholder linking to a feature that
doesn't exist yet, use `<button type="button" disabled aria-disabled="true">`
(matching styling via className) instead of `<a href="#">`. This is the
semantically correct "currently unavailable action," not a real anchor.
Swap it back to a real `<Link href="/actual/route">` once the destination
route ships — do not leave the disabled-button placeholder in place
after the target page exists.
