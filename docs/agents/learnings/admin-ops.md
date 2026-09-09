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

## Windows paths ending in a trailing backslash before a closing quote break this Bash tool's parser -- use forward slashes

Discovered while building HUB-43 (RMA): any Bash command whose double-quoted
path argument ends in `...\"` (a directory path with a trailing backslash
immediately before the closing quote, e.g. `"D:\...\rma\"`) causes the shell
to interpret `\"` as an escaped quote rather than a path separator + string
terminator, leaving the string unterminated -- every subsequent Bash call in
that session then fails with a cryptic `unexpected EOF while looking for
matching` error, even for totally unrelated trivial commands, because the
parser state carries over. The bug isn't specific to heredocs: it triggers
on any trailing-backslash-then-quote sequence. Fix: always use forward
slashes for Windows paths passed to the Bash tool (`D:/AI Project/...`
instead of `D:\AI Project\...`); Windows/Node/git-bash all accept forward
slashes natively, so there's no downside. If a command mysteriously fails
with an "unexpected EOF" bash syntax error that has nothing to do with your
actual command content, suspect a trailing-backslash path first before
assuming it's a heredoc-quoting/content problem -- it cost significant time
misdiagnosing this as a content-encoding issue in a large heredoc before the
real cause (a completely unrelated later `ls "...\"` command in the same
investigation) was found via a minimal repro.

## For large multi-line new files, prefer the Edit tool (empty old_string on a pre-touched empty file) over Bash heredoc/python-heredoc

Once a heredoc-based `cat > file << 'EOF' ... EOF` write mysteriously fails
(see the trailing-backslash finding above, or any other shell-quoting
edge case), the fastest reliable recovery is: `printf '' > path` (or
otherwise touch the file to exist), `Read` it once (required before any
`Edit`), then `Edit` with `old_string: ""` and the full file body as
`new_string`. This sidesteps all shell quoting/escaping entirely since the
content goes through the tool's own parameter channel, not through a shell
command string.

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

## HUB-43 (RMA): reused HUB-42's exact code shape but deliberately dropped the override concept

`src/lib/rma/transitions.ts` / `src/lib/rma/api.ts` mirror
`src/lib/warranty/claim-transitions.ts` / the claim PATCH route's shape
(adjacency-map state machine, `RmaError` with a `code` for HTTP-status
mapping, append-only history table, audit log in the same tx) but the
architect determined no override mechanism is needed for RMA -- physical
inspection status has no "warranty expired but we'll allow it anyway"
analog the way claim approval does. Do not add one speculatively; if a
future issue needs it, it should come with its own explicit design
decision, not a copy-paste of HUB-42's `writeOverrideAuditLog` path.

`RmaRequest` is a strict 1:1 child of `WarrantyClaim` via a unique
`claim_id` FK (not a standalone entity) -- created only via
`createRmaForClaim`, which validates the claim's _current_ status is one of
`SERVICE_REPAIR`/`REPLACEMENT`/`REFUND` (HUB-42's claim-state-machine
terminal-ish branch statuses) before allowing creation, and proactively
checks for an existing RMA before hitting the DB's unique-constraint path
(cleaner error message, same end result). No money fields were duplicated
onto `RmaRequest` -- `repairCostUsd`/`refundAmountUsd` stay solely on
`WarrantyClaim`, exactly as scoped.
