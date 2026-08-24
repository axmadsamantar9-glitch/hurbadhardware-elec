# Security Reviewer Agent — Learnings

## HUR-172: Rate-Limiting & Privacy Guidelines (2026-08-24)

### Rate-limit key trusts spoofable X-Forwarded-For

**Symptom:** Per-IP(+account) rate limiting can be bypassed by rotating a client-supplied X-Forwarded-For header per request.

**Cause:** `getClientIP()` in `src/lib/middleware/rate-limit.ts` reads `x-forwarded-for` verbatim from the Request with no trusted-proxy validation.

**Rule going forward:** When reviewing any new rate-limit-gated endpoint (login, checkout, webhook), check that the deployment platform overwrites/sanitizes X-Forwarded-For before code sees it, or flag as non-blocking MEDIUM follow-up if unconfirmed — do not treat rate-limiting as airtight brute-force protection on this codebase until that's verified.

### Logger PII redaction must cover message AND context

**Symptom:** `redactPII()` applied only to the `context` object; PII embedded in the `message` string argument leaked unredacted (e.g. `logger.info(\`Registered ${email}\`)` leaked the raw email).

**Cause:** `write()` in `src/lib/logger.ts` previously piped `message` straight to `JSON.stringify` without running it through `redactPII`/`scrubString`.

**Rule going forward:** For any logger/redaction diff, verify both the free-text message and every context value are passed through the full redaction pipeline (PII regex + secret-env scrub) — check line-by-line, don't trust a changelog claim.
