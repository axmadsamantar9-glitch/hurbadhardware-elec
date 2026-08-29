# Performance & Deployment — Durable Learnings

Read this before starting any performance-deployment task. Append durable
lessons here after finishing.

---

## Lighthouse tooling (HUB-24, 2026-08-29)

**tsx breaks Lighthouse's page-function serialization — run the audit script
as plain Node ESM (`.mjs`), never `.ts` via `tsx`.** tsx's esbuild transform
injects a `__name(...)` helper into every function it processes, including
lighthouse's own `node_modules` code. Lighthouse serializes some
page-injected functions with `.toString()` and evaluates them inside the
browser page via CDP — `__name` only exists in the transformed module's
local Node scope, not in the browser page, so the injected function throws
`ReferenceError: __name is not defined` at audit time. This reproduced on
every single audited page, 100% of the time. Fix: write/keep the Lighthouse
runner as untransformed plain `.mjs`, invoked with `node`, not `tsx`. This
is unlike the existing `scripts/dogfood-*.ts` convention (which run fine via
`tsx` because they only make plain HTTP calls, not CDP page-function
injection) — do not "fix" this by converting the Lighthouse script back to
`.ts` to match that convention.

**Lighthouse's own `defaultSettings` already are mobile + Slow 4G — no
custom config needed.** `node_modules/lighthouse/core/config/constants.js`
sets `formFactor: "mobile"`, `throttling: throttling.mobileSlow4G`,
`throttlingMethod: "simulate"` as the literal defaults. Passing no config
overrides at all to `lighthouse(url, options)` gives you exactly this
preset. Useful when a PRD specifies a network condition ("East African
network conditions") with no numeric profile — Lighthouse's standard mobile
Slow-4G preset is the reasonable, documented substitution; don't invent a
custom RTT/bandwidth profile from nothing.

**`--headless=new` (Chrome's default headless mode since M112) hung
indefinitely mid-navigation on this Windows/Chrome 151 environment** — CDP
connection stayed open but `Page.navigate` never resolved, on every page
tested, both dev and production servers. Classic `--headless` completed the
identical audit in ~16s. If Lighthouse/chrome-launcher hangs with no error
and no timeout ever firing on Windows, try classic `--headless` before
assuming an app-level bug. Re-test `--headless=new` if Chrome or
chrome-launcher gets upgraded later — this may be version-specific.

**A redirect-only route (bare `/`, which just 307s to a locale + sets a
cookie) also hangs Lighthouse's `Page.navigate` indefinitely** — reproduced
consistently regardless of headless mode or `maxWaitForLoad` override, even
though the identical redirect completes in <50ms via `curl`. Don't spend
time trying to fix this at the Lighthouse-config level; audit the page the
redirect lands on instead (e.g. `/en` instead of `/`) and document the
exclusion. This is very likely to recur for any i18n-root-redirect app.

**Windows leaves orphaned `next dev`/`next start` processes holding the
port after a spawned-shell child is killed.** Spawning `npm run dev` via
`spawn("cmd", ["/c", "npm run dev"])` and later calling `.kill()` on that
handle only kills the `cmd.exe` wrapper — Turbopack's dev server survives as
a detached process still LISTENING on port 3000, breaking every subsequent
run ("Another next dev server is already running" / silently binding to
3001 instead while your script's hardcoded port-3000 checks then hang
against a stale process). Fix: kill the whole tree with
`spawn("taskkill", ["/PID", pid, "/T", "/F"])` on Windows instead of
`child.kill()`. Even with tree-kill, a Turbopack dev-server orphan was
_occasionally_ still observed to survive — if a run fails immediately with
a port-in-use symptom, `netstat -ano | findstr :3000` and manually
`taskkill /PID <pid> /F` the listed PID before retrying. Don't burn time
trying to make this 100% automatic; it's a known Windows/Turbopack quirk.

**Dev-mode Lighthouse Performance scores run ~10-20 points lower than a real
production build** (unminified JS, no code-splitting, HMR overhead) — e.g.
`/en` scored 72-85 across repeated dev-mode runs vs. 96 on
`next build && next start`. Always audit the production build
(`next build && next start`) for any number that will be compared against a
PRD/acceptance-bar target; dev-mode is only useful for fast iteration during
active tuning.

**Backtick page-function serialization aside, watch out for shell/quote
escaping when writing multi-paragraph Markdown files via the Bash tool on
this Windows/Git-Bash setup.** Heredocs (`cat > file << 'EOF' ... EOF`,
including via `python3 << 'PYEOF'`) reliably broke ("unexpected EOF while
looking for matching `'`") once the body contained certain quote/backtick
patterns, even fully inside a quoted heredoc delimiter that should disable
shell interpolation. Root cause not fully isolated (some other Windows path
argument in the same command containing a trailing `\"` — backslash
immediately before a closing double-quote — is a classic POSIX-shell
foot-gun: `\"` is an escaped literal quote, not a closing quote, so any
argument like `"...somepath\"` silently breaks quoting for the rest of the
command). Reliable fix: use the `Edit` tool (write a 1-line placeholder file
via a minimal Python one-liner if the file doesn't exist yet, `Read` it,
then `Edit` in the real content) instead of fighting heredoc quoting for any
long Markdown/text content. Also avoid trailing backslashes immediately
before a closing double-quote in any Windows path argument passed to Bash.

## Process / scope notes

- `.gitignore` patterns using a single-level glob (`/reports/lighthouse/*.json`)
  do **not** match files nested one level deeper
  (`/reports/lighthouse/dev/*.json`) — use `/reports/lighthouse/**/*.json`
  if the report script writes into subdirectories (e.g. separate `dev/` vs
  `production/` folders, which this script does to avoid one run's reports
  clobbering the other's).
- ESLint's `no-console` allowlist in `eslint.config.mjs` was scoped to
  `scripts/**/*.ts` only — had to add `scripts/**/*.mjs` explicitly when the
  Lighthouse runner became plain JS, since `.mjs` isn't covered by a
  `.ts`-only glob.
