# Performance Testing — HurbadHardware

**Owner:** performance-deployment agent (HUB-24, Module 03). **Status:**
Foundations only — this establishes the Lighthouse tooling, methodology,
and a real baseline against every page that currently exists. Full
storefront performance work (catalog/PDP/cart/checkout) is blocked on
Module 05, which has not shipped yet — see "PRD target" below for the
specific acceptance bar that work must clear.

---

## 1. Tooling

`lighthouse` + `chrome-launcher` are devDependencies. The runner script is
`scripts/lighthouse-audit.mjs` — deliberately plain Node ESM, **not**
TypeScript run via `tsx`:

> tsx's esbuild transform injects a `__name(...)` helper into every
> function it processes, including lighthouse's own `node_modules` code.
> Lighthouse serializes some of its page-injected functions with
> `.toString()` and evaluates them inside the browser page via CDP — but
> `__name` only exists in the transformed module's local Node scope, not
> in the browser page, so the injected function throws
> `ReferenceError: __name is not defined` at audit time. Reproduced
> consistently; switching the runner to untransformed plain `.mjs` fixed
> it outright. Do not convert this script back to `.ts`/`tsx` without
> re-verifying this.

### Running it

```bash
npm run lighthouse        # audits the next dev server (fast, no build step)
npm run lighthouse:prod   # runs next build && next start first, then audits
```

Both commands: start the appropriate server, wait for `/api/health` to
respond, launch headless Chrome, audit every URL in the `PAGES` list in
`scripts/lighthouse-audit.mjs`, print a one-line-per-page summary to the
console, and write full per-page Lighthouse JSON reports to
`reports/lighthouse/dev/` or `reports/lighthouse/production/`
(git-ignored — see `.gitignore`; only the summarized scores below are
committed).

Update the `PAGES` array in that script as new pages ship.

### Known automation limitation: bare `/` cannot be audited

Bare `/` is next-intl's locale-detection route — it 307-redirects to
`/en` or `/so` and sets a `NEXT_LOCALE` cookie. Navigating headless Chrome
to it via the Lighthouse/CDP API **hangs indefinitely** (`Page.navigate`
never resolves), reproduced consistently with both `--headless` and
`--headless=new`, with and without an explicit `maxWaitForLoad` override —
even though the same redirect completes in under 50ms via `curl`. This is
a narrow limitation of automating a redirect-only route, not an app
performance problem. `PAGES` excludes `/` for this reason; `/en` and `/so`
(the pages the redirect lands on) are audited directly and are the
meaningful targets.

### Known environment issue: `--headless=new` hangs on this machine

Chrome's newer headless mode (`--headless=new`, default since Chrome M112)
was observed to hang mid-navigation on this Windows/Chrome 151 combination
— the CDP connection stayed open but `Page.navigate` never completed, on
**every** page, not just `/`. Classic `--headless` completed the identical
audit in about 16s. `scripts/lighthouse-audit.mjs` launches Chrome with
`chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu",
"--disable-dev-shm-usage"]`. If Chrome or `chrome-launcher` is upgraded
later, re-test `--headless=new` before switching back.

### Known environment issue: leftover server process on Windows

`next dev`/`next start` are spawned via a shell wrapper
(`cmd /c "npm run ..."` on Windows). On exit, the script kills the whole
process tree with `taskkill /PID <pid> /T /F`, but Turbopack's dev server
was still observed to occasionally survive as a detached orphan holding
port 3000, requiring a manual `taskkill /PID <pid> /F` before the next run
would bind successfully. If a run fails immediately with "port in use" /
"Another next dev server is already running", check
`netstat -ano | findstr :3000` and kill the listed PID before retrying.

---

## 2. Methodology

**Mobile emulation + Slow 4G throttling, applied via Lighthouse's own
defaults — no custom config.** lighthouse's `defaultSettings`
(`node_modules/lighthouse/core/config/constants.js`) are already
`formFactor: "mobile"`, `throttling: throttling.mobileSlow4G`,
`throttlingMethod: "simulate"`, Moto G power screen emulation, and a
mobile Chrome user agent — the runner passes no config overrides, so
every audit uses exactly this preset.

**This is an explicit substitution for "East African network
conditions."** The PRD does not specify a numeric 3G/4G bandwidth/RTT
profile for East Africa, so no custom throttling profile was invented.
Lighthouse's standard mobile + Slow 4G preset is used as the closest
available approximation and is documented here as a substitution, per
HUB-24's explicit scope decision. If a real numeric profile (e.g. from
Somtel/Hormuud network data) becomes available, it should replace this
preset via Lighthouse's `throttling`/`screenEmulation` config options —
not before.

**Dev vs. production build:** `npm run lighthouse` audits the unminified,
unbundled `next dev` server — useful for quick iteration but **not**
representative of the real Performance score. `npm run lighthouse:prod`
builds and audits the production server and is the number that matters
against the PRD's ≥85 target. Both are recorded below for transparency.

---

## 3. Baseline results (2026-08-29)

Audited every page that exists in the app router today (per HUB-24's
confirmed scope: catalog/PDP/cart/checkout do not exist yet — Module 05).
Scores are Lighthouse's 0-100 category scores; LCP/CLS/TBT are the lab
metrics from the same run. TBT (Total Blocking Time) is Lighthouse's lab
proxy for input responsiveness — Lighthouse cannot measure real-user FID
in a lab run; see the FID note below.

### Production build (`next build && next start`) — the number that matters

| Page                | Performance | Accessibility | Best Practices | SEO | LCP     | CLS | TBT    |
| ------------------- | ----------- | ------------- | -------------- | --- | ------- | --- | ------ |
| `/en`               | 96          | 100           | 92             | 100 | 1757 ms | 0   | 232 ms |
| `/so`               | 88          | 100           | 92             | 100 | 1795 ms | 0   | 478 ms |
| `/en/auth/signin`   | 95          | 98            | 92             | 100 | 1427 ms | 0   | 251 ms |
| `/en/auth/register` | 88          | 98            | 92             | 100 | 2848 ms | 0   | 326 ms |
| `/en/account`       | 95          | 98            | 92             | 100 | 2041 ms | 0   | 231 ms |
| `/en/admin`         | 95          | 98            | 92             | 100 | 1788 ms | 0   | 233 ms |

Every currently-existing page clears Performance ≥85, CLS ≤0.1 (all 0),
and LCP ≤2.5s except `/en/auth/register` (2848ms — flagged below).

### Dev server (`next dev`) — reference only, not representative

| Page                | Performance | Accessibility | Best Practices | SEO | LCP     | CLS | TBT     |
| ------------------- | ----------- | ------------- | -------------- | --- | ------- | --- | ------- |
| `/en`               | 82          | 100           | 92             | 100 | 1877 ms | 0   | 701 ms  |
| `/so`               | 85          | 100           | 92             | 100 | 1364 ms | 0   | 598 ms  |
| `/en/auth/signin`   | 76          | 98            | 92             | 100 | 1620 ms | 0   | 746 ms  |
| `/en/auth/register` | 72          | 98            | 92             | 100 | 1370 ms | 0   | 1153 ms |
| `/en/account`       | 75          | 98            | 92             | 100 | 2105 ms | 0   | 1221 ms |
| `/en/admin`         | 81          | 98            | 92             | 100 | 1801 ms | 0   | 756 ms  |

Dev-mode Performance scores are consistently about 10-20 points lower than
production, as expected (unminified JS, no code-splitting optimization,
HMR overhead). Use `npm run lighthouse:prod` for any real assessment.

### Notable findings from this baseline

- **`/en/auth/register` LCP (2848ms, production) exceeds the PRD's 2.5s
  target.** This is the only page/metric combination in the current audit
  that misses a PRD-level bar. Not fixed as part of HUB-24 (out of scope
  — foundations only) but flagged here for the owning agent (auth-platform
  or storefront) to address, e.g. by profiling the register page's
  largest contentful element.
- **Accessibility 98 (not 100) on `/en/auth/signin`, `/en/auth/register`,
  `/en/account`, `/en/admin`.** Full per-page JSON reports in
  `reports/lighthouse/production/*.json` (git-ignored locally, re-run
  `npm run lighthouse:prod` to reproduce) contain the specific failing
  audit(s); not triaged further here — flagged for the accessibility
  remediation owner per `docs/standards/accessibility.md`.
- **Best Practices capped at 92** on every page — likely the CSP/HSTS
  "Ensure CSP is effective against XSS attacks" or a similar Lighthouse
  best-practices audit; not triaged in this pass.
- **FID cannot be measured by Lighthouse.** Lighthouse is a lab tool
  (single synthetic run, no real user interaction) — it cannot produce a
  Chrome User Experience Report (CrUX) field FID or INP number. Total
  Blocking Time (TBT, shown above) is Lighthouse's standard lab proxy for
  input responsiveness and is what is tracked here. A real FID/INP number
  (from CrUX or Real User Monitoring) is only obtainable in production
  with real traffic — out of scope until the site is live.

---

## 4. PRD target (currently unauditable — re-verify once Module 05 ships)

PRD `docs/plans/PRD.md` line 1908 (U21):

> Lighthouse mobile score on `/[locale]/products` ≥ 85 (LCP ≤2.5 s, CLS
> ≤0.1, FID ≤100 ms).

**This specific page does not exist yet** — the catalog/product-listing
page is Module 05 (Storefront & Cart), which is blocked on Module 02/03
completing first (see `docs/agents/run-state.md` Tier 1). This target is
recorded here as the literal acceptance bar that must be re-verified with
a real `npm run lighthouse:prod` run against `/[locale]/products` once
that page ships — do not consider it satisfied by the baseline in
section 3, which audits different pages. Whichever agent builds the
catalog/PDP pages should re-run this audit as part of that work's
Production-Readiness gate check.

---

## 5. Re-running this audit

```bash
npm run lighthouse         # dev server, fast iteration
npm run lighthouse:prod    # production build — use this number for real assessment
```

Update `PAGES` in `scripts/lighthouse-audit.mjs` to add new routes as
they ship (e.g. `/[locale]/products` once Module 05 lands). Full JSON
reports land in `reports/lighthouse/{dev,production}/*.json`
(git-ignored); update the tables in section 3 with the new results and
re-check section 4's PRD target whenever `/[locale]/products` exists.

## 6. Full mobile E2E harness (deferred)

No browser-automation E2E runner (e.g. **Playwright**) exists in this
repo. Standing one up now was considered and explicitly deferred rather
than added as a token proof-of-harness: it has no real consumer until
Module 05's storefront pages exist to test flows like browse → cart →
checkout, and this environment already showed Chrome/headless
instability during the Lighthouse work above — adding a second
browser-automation dependency on top of that risk wasn't justified for
a smoke test with nothing to smoke-test yet. Revisit once Module 05
lands and there's a real storefront journey to automate.
