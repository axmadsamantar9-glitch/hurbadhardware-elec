# Payment Gateways -- Durable Learnings

## Vitest vi.mock hoisting requires vi.hoisted() for referenced mock fns

**Symptom:** `ReferenceError: Cannot access 'mockFoo' before initialization` when
a `vi.mock("module", () => ({ foo: mockFoo }))` factory references a
`const mockFoo = vi.fn()` declared at top level in the same file.

**Cause:** `vi.mock()` calls are hoisted above all imports/top-level const
declarations by Vitest's transform. A plain `const mockFoo = vi.fn()` above
the `vi.mock()` call is therefore NOT actually defined yet at the point the
hoisted factory runs.

**Rule going forward:** Always wrap mock-fn declarations referenced inside a
`vi.mock()` factory in `vi.hoisted(() => ({ mockFoo: vi.fn(), ... }))` and
destructure from that. This pattern is used consistently across
`convert.test.ts`, `settle.test.ts`, `reconcile.test.ts`, and all three route
test files in this payment layer.

## Bash heredocs choke on long JS/TS content with many embedded quotes

**Symptom:** `unexpected EOF while looking for matching '` when using
`cat > file << 'EOF' ... EOF` to write a large test file containing nested
double quotes, backticks, and apostrophes in prose comments.

**Cause:** Not fully diagnosed (single-quoted heredoc delimiters should be
byte-literal), but empirically, very long heredocs with a mix of `${}`,
backticks, and English contractions ("caller's", "doesn't") in this sandboxed
bash tool occasionally break mid-parse. Splitting the same content into
several smaller `cat >>` appends (or writing content via a Python one-liner
that writes the file directly, avoiding the contraction apostrophes) reliably
works around it.

**Rule going forward:** For large generated test files, either (a) avoid
English contractions/apostrophes in comments entirely, or (b) write the file
in 2-4 smaller heredoc chunks appended sequentially rather than one giant
heredoc.

## Gateway adapters already correctly isolate provider quirks; test at the boundary

**Observation, not a bug:** WaafiPay/eDahab/Paystack adapters (as designed by
the previous instance) correctly keep all provider-specific parsing,
signing, and truncation logic inside their own files. Structural properties
that matter (ROUND_DOWN truncation, exact-string-reuse for eDahab's hash,
Paystack's pre-HTTP-call integer check) are each provable with a single
targeted unit test per property -- no need for end-to-end gateway simulation.
Iron Rule #2 (`settledAmount` never overwrites `Payment.chargeAmount`) is
actually enforced at `settle.ts`'s update-payload level, not inside any
adapter -- `settlePayment()`'s Prisma update data for COMPLETED never
includes a `chargeAmount` key at all. Test that fact directly on the
`settle.ts` update call, not by inspecting adapter return values.
