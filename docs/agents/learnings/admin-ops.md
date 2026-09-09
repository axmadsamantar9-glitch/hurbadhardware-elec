# Admin Ops — durable learnings

## HUB-42 (Warranty Management): no `/admin` App Router server-page precedent existed -- had to establish it from two different existing conventions

**Context:** Before this issue, admin surfaces in this repo were: one API route
(`src/app/api/admin/payments/route.ts`, server-side `auth()` + role check) and
one `"use client"` admin page (`src/app/[locale]/admin/payments/page.tsx`,
`useSession()` + `useEffect` redirect). There was no server-Component admin
page anywhere to copy. Customer-facing account pages, by contrast, are all
server Components using the `auth()` + `redirect()` pattern
(`src/app/[locale]/account/orders/page.tsx`).

**Rule going forward:** For this codebase's two existing admin-page
conventions, match each to its domain rather than inventing a third: customer
`/account/**` pages stay server Components with `auth()`/`redirect()` +
ownership-scoped-in-the-`where`-clause data fetches; `/admin/**` pages stay
`"use client"` with `useSession()` + `useEffect` redirect, fetching from an
API route that re-verifies `session.user.role === "ADMIN"` server-side (never
trust the client check alone). `src/proxy.ts` (this repo's renamed
middleware) already blanket-redirects non-ADMIN sessions away from any
`/admin/**` path server-side, so the client-side check in the page is
defense-in-depth, not the actual trust boundary.

## `prisma migrate dev --create-only` on this schema still bundles the known `search_vector` false-drift noise, even for unrelated new tables

Confirmed again on a migration that added 3 brand-new tables + 1 nullable
column on `products` with zero intentional touches to `search_vector`: the
generated SQL still included `DROP INDEX "products_search_vector_idx"` +
`ALTER COLUMN "search_vector" DROP DEFAULT`. Per the precedent in
`docs/agents/learnings/architect.md` and others, stripped both statements by
hand before `prisma migrate deploy`, leaving a comment in the migration file
explaining why. Confirmed via `prisma migrate status` afterward that the DB
came out "up to date" -- the manual edit doesn't desync Prisma's migration
history as long as the net _schema effect_ still matches what the removed
statements would have described as already-true (the generated column and
its GIN index were never actually touched, so nothing needed to change).

## Adding a new nullable field to `Product` breaks any test file with a hand-written full `mockProduct` object literal

TypeScript's structural typing treats a `field: T | null` schema column as a
_required key_ on the inferred Prisma type (nullable ≠ optional key) --
adding `Product.warrantyMonths Int?` to the schema didn't touch any
application code, but broke `src/lib/api/products.test.ts`'s `mockProduct`
object literal (missing required property) everywhere it was used, because
that test builds one full object and reuses it rather than using a partial
type. Fix was a one-line addition (`warrantyMonths: null`) to the single
shared mock, not a per-test-case fix -- always check for a shared fixture
object before assuming a schema-additive change requires touching every call
site.

## PRD §6.9's warranty-claim-chain prose is ambiguous about REJECTED and must be resolved by design intent, not verbatim graph-literalism

The PRD's exact wording is: "Requested -> eligibility review ->
approved/rejected -> troubleshooting/diagnosis -> service/repair ->
replacement OR refund -> completed/closed." Read as a literal single
left-to-right adjacency chain, this would route `REJECTED` claims into
`TROUBLESHOOTING`, which makes no sense (a rejected claim doesn't get
repaired). `src/lib/warranty/claim-transitions.ts` resolves this by treating
`REJECTED` as a terminal branch off `ELIGIBILITY_REVIEW` straight to
`CLOSED`, and only `APPROVED` continues into the repair pipeline -- documented
inline with the reasoning. If a future PRD revision clarifies this
differently, update both the transitions table and its test file's
`validPairs`/negative-case list together.

## AC7 "approve/advance" override requirement -- resolved as "any transition except REJECTED/CLOSED"

The architect's spec for AC7 says an override reason is required when the
warranty is not ACTIVE "and the PATCH would approve/advance the claim,"
without enumerating which target statuses count. Implemented as: every
transition target _except_ `REJECTED` and `CLOSED` requires the reason when
the warranty is non-ACTIVE (`NON_APPROVAL_TRANSITIONS` in
`src/app/api/admin/warranties/claims/[id]/route.ts`) -- since denying or
closing a claim against an inactive warranty grants nothing and shouldn't be
gated behind a justification. If a future revision wants overrides to also
gate rejections (e.g. "you can't even record a decision without justifying
why you're looking at this expired warranty at all"), that's a one-line
change to the `NON_APPROVAL_TRANSITIONS` array plus its dedicated test case.
