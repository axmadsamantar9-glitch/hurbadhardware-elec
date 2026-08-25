# Auth & Platform Foundation — Learnings

## next-intl/next-auth Cannot Be Imported In Vitest Without server.deps.inline

**Symptom:** `import ... from "next-intl/middleware"` or any transitive import
of `@/auth` (which pulls in `next-auth`) fails inside vitest with:
`Cannot find module '.../node_modules/next/server' imported from
next-intl/dist/.../middleware.js` (or the equivalent for `next-auth/lib/env.js`).
Direct `import { NextRequest } from "next/server"` from your OWN source files
works fine — only imports of "next/server" _from inside another package in
node_modules_ fail.

**Cause:** This repo is on Next.js 16.3.1 (breaking-changes generation — see
AGENTS.md), and its `package.json` has no `exports` map for `next/server`.
Vite's default Vitest module resolution externalizes/resolves node_modules
dependencies differently than the app's own aliased source files, and hits
strict extensionless-import resolution that fails for extensionless
`next/server` imports coming from inside `next-intl`/`next-auth`.

**Rule going forward:** Add the offending package(s) to
`vitest.config.ts`'s `test.server.deps.inline` (regex match, e.g.
`[/next-intl/, /next-auth/, /@auth\/prisma-adapter/]`) to force Vite to
process them through its own resolver instead of Node's native one. This
unblocks testing the REAL `next-intl` middleware and even the real exported
`proxy()` function (including calling `auth()` inside it, which needs
`@auth/prisma-adapter` inlined too) with a real `NextRequest` — no more need
to hand-roll logic replicas for locale-redirect or middleware tests. Prisma
client construction itself does NOT fail in this env even without a live DB
connection (`DATABASE_URL` is present in the local `.env`), so real
`proxy()` calls that reach `auth()` still work in tests as long as they
don't require an actual DB round trip for the assertion being made (e.g. a
public-route locale redirect returns before `auth()` is ever called).

## next-intl Has No Built-In Cross-Locale Message Fallback

**Symptom:** Assumed that a translation key present in `en.json` but missing
from `so.json` would automatically render the English text under the `so`
locale ("next-intl's real fallback mechanism"). It does not, by default.

**Cause:** `use-intl`'s core translator (which next-intl wraps) only has a
`MISSING_MESSAGE` error path whose default `getMessageFallback` renders the
dotted key path (e.g. `"checkout.placeOrder"`), not another locale's value.
There is no automatic cross-locale merge unless the app builds one.

**Rule going forward:** `src/i18n.ts` now deep-merges `so.json` on top of
`en.json` (`mergeMessagesWithFallback`) before handing messages to
`next-intl`, so a key missing from `so.json` falls back to the English
string in production, not to next-intl's raw key-path fallback. Any new
locale added later should get the same treatment. Key-parity between
`en.json`/`so.json` is still enforced by tests (`src/messages.test.ts`) —
the merge is defense-in-depth, not a substitute for keeping both files in
sync.

## Bilingual Prisma Field Pairs Live Across 5 Models, Not Just Product

**Symptom:** Assumed only `Product.nameEn/nameSo` and
`Product.descriptionEn/descriptionSo` existed as `_en`/`_so` pairs.

**Cause:** `docs/schema/01-MODELS.md` and `prisma/schema.prisma` show the
pattern repeats on `Category` (`nameEn/nameSo`), `ProductImage`
(`altEn/altSo`), `ProductSpec` (`keyEn/keySo`, `valueEn/valueSo`), and
`OrderItem` (`nameSnapshotEn/nameSnapshotSo`).

**Rule going forward:** Any future locale-aware-field helper (e.g.
`localeField`/`useLocaleField` in `src/lib/locale-field.ts` /
`src/hooks/use-locale-field.ts`) should be generic over a `base` string
(`name`, `description`, `alt`, `key`, `value`, `nameSnapshot`, ...) rather
than hardcoded to `Product`, since downstream catalog/PDP/order-history UI
will need all five.
