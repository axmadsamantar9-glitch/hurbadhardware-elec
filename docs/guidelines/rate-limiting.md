# Rate-Limiting Guidelines

**Context:** This document specifies rate-limit thresholds, enforcement strategy, and monitoring approach for HurbadHardware's API and user-facing endpoints.

---

## AC1: Rate-Limited Endpoints (Inventory)

The following endpoint categories are rate-limited to protect against abuse and resource exhaustion:

1. **Authentication Endpoints** (/auth/signin, /auth/register)
   - Purpose: Prevent brute-force attacks and credential enumeration
   - Scope: Login attempts, registration, password reset requests

2. **API Endpoints** (all /api/* routes except /api/health)
   - Purpose: Protect backend compute and database from overload
   - Scope: Product catalog, search, order queries, admin operations

3. **Checkout Endpoints** (/api/checkout/*, payment initiation)
   - Purpose: Prevent checkout spam and payment replay attacks
   - Scope: Order creation, payment submission, confirmation requests

4. **Search Endpoints** (/api/products/search, full-text search)
   - Purpose: Prevent FTS query DoS (resource-expensive operations)
   - Scope: Product search, filtering, pagination

5. **Webhook Endpoints** (/api/webhooks/*)
   - Purpose: Prevent webhook spam from malicious or misconfigured partners
   - Scope: Payment gateway callbacks, third-party notifications

---

## AC2: Rate-Limit Thresholds

All thresholds are enforced per-key and per-endpoint. Threshold values are configurable via environment variables.

| Endpoint Category | Threshold        | Key Type            | Example                                     |
| ----------------- | ---------------- | ------------------- | ------------------------------------------- |
| Login             | 5 requests/min   | IP + account        | user@example.com from 192.168.1.1           |
| API (general)     | 60 requests/min  | User ID             | User-authenticated requests to /api/*       |
| Checkout          | 10 requests/min  | User ID             | Order creation, payment submission per user |
| Webhook           | 120 requests/min | IP (webhook source) | Payment gateway callback IP address         |
| Public endpoints  | 30 requests/min  | IP                  | Unauthenticated product catalog, search     |

**Notes:**

- Thresholds are per-minute windows, reset on each minute boundary.
- For composite keys (IP + account), the rate limit applies to the combination, not either individually.
- Webhook limits are per-IP to account for multiple webhooks from a single source.

---

## AC3: Enforcement Strategy

### HTTP Response & Headers

When a client exceeds its rate limit, the server returns:

- Status: 429 (Too Many Requests)
- Header: Retry-After (seconds until client should retry)
- Response body: JSON error object with message, code, and retryAfter

No queueing of requests occurs; clients must implement exponential backoff per Retry-After header.

### Client Backoff Strategy (Documentation)

Clients receiving 429 should:

1. Read Retry-After header for minimum wait time
2. Implement exponential backoff (1s → 2s → 4s → 8s)
3. Cap maximum backoff at 5 minutes
4. Add random jitter (0-1s) to prevent thundering herd

---

## AC4: Rate-Limit Keying Strategy

Rate limits are enforced using hybrid keys:

- **Authentication Endpoints:** IP + Account (e.g., auth:192.168.1.1:user@example.com)
- **API Endpoints (Authenticated):** User ID (e.g., api:user_12345)
- **Checkout Endpoints:** User ID (e.g., checkout:user_12345)
- **Public Endpoints (Unauthenticated):** IP (e.g., public:192.168.1.1)
- **Webhook Endpoints:** Source IP (e.g., webhook:192.0.2.1)

---

## AC5: Example Middleware Code

Implementation: See src/lib/middleware/rate-limit.ts

**Algorithm:** Token Bucket

- Each rate-limit key maintains a bucket with tokens.
- Bucket starts full (capacity = threshold).
- Each request consumes 1 token.
- Tokens regenerate at threshold/minute rate.
- If bucket is empty, request is rejected (429).

**Storage:** In-memory Map with { tokens: number, lastRefill: timestamp }

**Alternative:** Vercel Edge Config (KV store) for distributed deployments; not yet implemented.

---

## AC6: Idempotency Requirements

Checkout and payment endpoints support idempotency via X-Idempotency-Key header.

- **Cache key:** idempotency:<X-Idempotency-Key value>
- **Cache value:** { status, result }
- **TTL:** 5 minutes

On duplicate request (same idempotency key), cached result is returned without re-processing.

---

## AC7: Monitoring & Alerting

### Logging

Rate-limit triggers are logged at INFO level with:

- rateLimitKey
- threshold
- windowSeconds
- correlationId

### Metrics to Track

1. **Rate-Limit Triggers:** Counter per endpoint category
2. **Retry-After Times:** Histogram per category
3. **Token Bucket Saturation:** Optional gauge for debugging

### Alerting Strategy

- Alert if rate-limit triggers exceed 10/min for any endpoint category
- Page on-call for checkout spikes (potential attack)
- Investigate but do not page for public endpoint rate-limits

---

## Related Documents

- API Standards: docs/API-STANDARDS.md
- Privacy & Data: docs/guidelines/privacy-and-data.md
- PRD §9: Observability & Security (correlation ID and logging)
