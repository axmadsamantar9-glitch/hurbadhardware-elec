# API Standards

Formal standards and conventions for HurbadHardware API design, ensuring consistency, security, and developer experience across all endpoints.

**Philosophy:** Every API response is predictable. Every error is traceable. Every request is validated.

## Table of Contents

1. [HTTP Status Codes](#http-status-codes)
2. [Request/Response Shape](#requestresponse-shape)
3. [Error Response Format](#error-response-format)
4. [Authentication & Auth Headers](#authentication--auth-headers)
5. [Validation & Error Codes](#validation--error-codes)
6. [Payment Security](#payment-security)
7. [Rate Limiting](#rate-limiting)
8. [Caching Strategy](#caching-strategy)
9. [Logging & Correlation IDs](#logging--correlation-ids)
10. [API Versioning](#api-versioning)

---

## HTTP Status Codes

All endpoints use standard HTTP status codes. Clients must handle all of the following:

| Status  | Meaning               | When to Use                               | Example                                       |
| ------- | --------------------- | ----------------------------------------- | --------------------------------------------- |
| **200** | OK                    | Successful GET, returning data            | GET /api/products → list of products          |
| **201** | Created               | Successful POST, resource created         | POST /api/products → new product              |
| **400** | Bad Request           | Validation error, malformed request       | Invalid query params, invalid JSON            |
| **401** | Unauthorized          | Missing or invalid auth credentials       | No Bearer token, expired token                |
| **403** | Forbidden             | Authenticated but no permission           | User tries to delete another user's order     |
| **404** | Not Found             | Resource does not exist                   | GET /api/products/invalid-id                  |
| **409** | Conflict              | Resource already exists or state conflict | POST duplicate order                          |
| **422** | Unprocessable Entity  | Semantic validation error                 | Price < 0, invalid email format               |
| **429** | Too Many Requests     | Rate limit exceeded                       | Exceeded requests/minute quota                |
| **500** | Internal Server Error | Unhandled server error                    | Database connection fails, uncaught exception |
| **503** | Service Unavailable   | Temporary service degradation             | Database unreachable, health check degraded   |

### Status Code Decision Tree

```
Is the request valid (syntax, format)?
  No  → 400 Bad Request
  Yes → Is the request authenticated?
    No  → 401 Unauthorized
    Yes → Does the user have permission?
      No  → 403 Forbidden
      Yes → Does the resource exist?
        No  → 404 Not Found
        Yes → Is the request semantically valid (business logic)?
          No  → 422 Unprocessable Entity (or 409 for conflicts)
          Yes → Did the operation succeed?
            Yes → 200 OK or 201 Created
            No  → 500 Internal Server Error
```

---

## Request/Response Shape

### Successful Response

Successful responses return data in the response body with appropriate status code (200, 201).

```typescript
// ✅ GET /api/products
{
  "products": [
    { "id": "prod-1", "name": "Laptop", "price": 999.99 },
    { "id": "prod-2", "name": "Monitor", "price": 299.99 }
  ],
  "total": 100,
  "page": 1,
  "limit": 20,
  "hasMore": true
}

// ✅ POST /api/orders (201 Created)
{
  "id": "order-123",
  "items": [...],
  "total": 1299.98,
  "status": "pending",
  "createdAt": "2026-08-24T10:00:00Z"
}
```

### Request Format

All requests use JSON (Content-Type: application/json).

```typescript
// ✅ POST /api/orders with JSON body
{
  "items": [
    { "productId": "prod-1", "quantity": 1 }
  ],
  "shippingAddress": { ... },
  "paymentMethod": "card"
}

// ✅ GET /api/products with query parameters
GET /api/products?page=1&limit=20&search=laptop&category=electronics
```

---

## Error Response Format

All error responses follow a consistent shape:

```typescript
type ErrorResponse = {
  error: {
    message: string; // Human-readable message (e.g., "Validation failed")
    code: string; // Machine-readable code (e.g., "VALIDATION_ERROR")
    issues?: unknown[]; // Optional: validation issues from Zod
  };
};
```

### Error Response Examples

**400 Bad Request — Validation Error**

```json
{
  "error": {
    "message": "Request body failed validation",
    "code": "VALIDATION_ERROR",
    "issues": [{ "path": ["quantity"], "message": "Must be > 0" }]
  }
}
```

**401 Unauthorized — Missing Auth**

```json
{
  "error": {
    "message": "Missing or invalid authorization header",
    "code": "UNAUTHORIZED"
  }
}
```

**403 Forbidden — No Permission**

```json
{
  "error": {
    "message": "User does not have permission to access this resource",
    "code": "FORBIDDEN"
  }
}
```

**404 Not Found**

```json
{
  "error": {
    "message": "Product not found",
    "code": "NOT_FOUND"
  }
}
```

**422 Unprocessable Entity — Business Logic Error**

```json
{
  "error": {
    "message": "Order total exceeds user credit limit",
    "code": "EXCEEDS_CREDIT_LIMIT"
  }
}
```

**500 Internal Server Error**

```json
{
  "error": {
    "message": "Internal server error",
    "code": "INTERNAL_ERROR"
  }
}
```

---

## Authentication & Auth Headers

### Bearer Token Format

All authenticated endpoints require the `Authorization` header with a Bearer token:

```
Authorization: Bearer <token>
```

**Token Format:** JWT (JSON Web Token) issued by NextAuth v5

**Expiration:** Tokens expire after 24 hours (configurable)

**Refresh:** Use the `/api/auth/callback/credentials` flow to refresh

### Example Authenticated Request

```bash
curl -X GET https://hurbad-hardware.com/api/account \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json"
```

### Public Endpoints (No Auth Required)

- `GET /api/products` — Product listing (public)
- `GET /api/health` — Health check
- `POST /api/auth/...` — Auth endpoints (signin, signup, callback)

### Protected Endpoints (Auth Required)

- `GET /api/account` — User account details
- `POST /api/orders` — Create order
- `GET /api/orders` — User order history
- Any endpoint requiring user context

---

## Validation & Error Codes

### Standard Error Codes

All error responses use one of these machine-readable codes:

| Code                     | HTTP Status | Meaning                                                   |
| ------------------------ | ----------- | --------------------------------------------------------- |
| `INVALID_JSON`           | 400         | Request body is not valid JSON                            |
| `VALIDATION_ERROR`       | 400         | Request body failed Zod schema validation                 |
| `UNAUTHORIZED`           | 401         | Missing or invalid auth credentials                       |
| `FORBIDDEN`              | 403         | Authenticated but no permission for this resource         |
| `NOT_FOUND`              | 404         | Resource does not exist                                   |
| `CONFLICT`               | 409         | Resource already exists (duplicate key) or state conflict |
| `EXCEEDS_CREDIT_LIMIT`   | 422         | Order total exceeds user credit limit                     |
| `INSUFFICIENT_INVENTORY` | 422         | Product quantity not available                            |
| `INVALID_PRICE`          | 422         | Price validation failed (negative, etc.)                  |
| `RATE_LIMIT_EXCEEDED`    | 429         | Too many requests in time window                          |
| `INTERNAL_ERROR`         | 500         | Unhandled server error                                    |

### Validation Pattern

All endpoints validate input with Zod schemas before processing:

```typescript
// ✅ Example: Product creation endpoint
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().positive(),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = createProductSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          message: "Request body failed validation",
          code: "VALIDATION_ERROR",
          issues: result.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  // Process validated data
  const product = await db.product.create({ data: result.data });
  return NextResponse.json(product, { status: 201 });
}
```

---

## Payment Security

### Webhook Signature Verification

All payment gateway webhooks (WaafiPay, eDahab, Paystack) must be verified before processing:

```typescript
// ✅ Webhook signature verification (HMAC-SHA256)
import crypto from "crypto";

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-webhook-signature");
  const body = await request.text();

  if (!verifyWebhookSignature(body, signature, WEBHOOK_SECRET)) {
    return NextResponse.json(
      { error: { message: "Invalid signature", code: "INVALID_SIGNATURE" } },
      { status: 401 }
    );
  }

  // Process webhook
}
```

### Idempotency Keys

Payment endpoints must support idempotent requests via `Idempotency-Key` header:

```
POST /api/payments
Idempotency-Key: client-generated-uuid
```

**Server behavior:**

- First request: Process payment, store result
- Duplicate request (same key): Return cached result (no re-charge)

**Rationale:** Network retries should not double-charge customers

### Payment Confirmation Flow

1. Client initiates payment → Payment gateway returns transaction ID
2. Client polls `/api/payments/{id}/status` OR webhook notifies server
3. Server verifies with payment gateway (secondary confirmation)
4. Server updates order status and audit log
5. Server returns confirmation to client

**Security:** Every payment state change is logged to append-only AuditLog

---

## Rate Limiting

### Rate Limit Headers

All endpoints return rate-limit info in response headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1629880000
```

### Rate Limit Rules

| Endpoint                     | Limit        | Window   |
| ---------------------------- | ------------ | -------- |
| `GET /api/products` (search) | 100 requests | 1 minute |
| `POST /api/orders`           | 10 requests  | 1 minute |
| `POST /api/auth/signin`      | 5 requests   | 1 minute |
| `/api/payments`              | 10 requests  | 1 minute |

### Rate Limit Exceeded Response

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

HTTP Status: **429 Too Many Requests**

---

## Caching Strategy

### Cache-Control Headers

Responses set Cache-Control headers to guide client and proxy caching:

```
// ✅ Public data (5-minute cache)
Cache-Control: public, max-age=300, s-maxage=300

// ✅ Private user data (no cache)
Cache-Control: private, no-cache

// ✅ Dynamic content (1-hour cache)
Cache-Control: public, max-age=3600, s-maxage=3600
```

### Cacheable Endpoints

- `GET /api/products` — Public, cacheable for 5 minutes
- `GET /api/categories` — Public, cacheable for 1 hour
- `GET /api/account` — Private (authenticated), no cache

### Non-Cacheable Endpoints

- `POST /api/orders` — Mutating, no cache
- `POST /api/auth/*` — Auth state, no cache
- `GET /api/orders` — User-specific, no cache (use ETags if needed)

---

## Logging & Correlation IDs

### Correlation ID Tracking

Every request carries a `correlationId` for end-to-end tracing:

```typescript
export async function GET(request: Request) {
  const correlationId = await getCorrelationId();

  try {
    const products = await getProducts();
    logger.info("products.fetched", { correlationId, count: products.length });
    return NextResponse.json(products);
  } catch (error) {
    logger.error("products.fetch.failed", { correlationId, error });
    return NextResponse.json(
      { error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
```

### Logging Levels

- **info** — Successful operations (product fetched, order created, etc.)
- **warn** — Unexpected but recoverable conditions (rate limit approaching, validation warning)
- **error** — Failures requiring investigation (database error, payment gateway timeout)

### Log Format

All logs are structured JSON with `correlationId` for tracing:

```json
{
  "level": "info",
  "message": "product.fetched",
  "correlationId": "req-abc123",
  "count": 50,
  "durationMs": 125,
  "timestamp": "2026-08-24T10:00:00.000Z"
}
```

---

## API Versioning

### Versioning Strategy

**Phase 1:** No versioning required. All breaking changes require client update.

**Phase 2+:** If needed, use URL path versioning:

- `/api/v1/products` (legacy)
- `/api/v2/products` (new)

### Breaking Changes

A breaking change is:

- Removing a required response field
- Changing a field type
- Removing an endpoint
- Changing HTTP status code semantics

**Non-breaking changes:**

- Adding optional response fields
- Adding optional request parameters
- Adding new endpoints
- Adding new error codes

### Deprecation Policy

When deprecating an endpoint:

1. Add `Deprecation: true` header to response
2. Add `Sunset` header with removal date: `Sunset: Sun, 24 Aug 2027 00:00:00 GMT`
3. Update API documentation
4. Notify clients 3 months in advance

```
Deprecation: true
Sunset: Sun, 24 Aug 2027 00:00:00 GMT
Link: </api/v2/products>; rel="successor-version"
```

---

## Implementation Checklist

For each new endpoint:

- [ ] **Validation:** Zod schema for all inputs
- [ ] **Auth:** Correct auth requirement (public, protected, admin-only)
- [ ] **Status codes:** Correct HTTP status per decision tree
- [ ] **Error handling:** All errors wrapped in ErrorResponse shape
- [ ] **Logging:** Info/warn/error logs with correlationId
- [ ] **Caching:** Cache-Control headers set appropriately
- [ ] **Rate limiting:** Rate-limit headers included
- [ ] **Payments:** Webhook signature verification (if payment-related)
- [ ] **Idempotency:** Idempotency-Key support (if mutating payments)
- [ ] **Documentation:** JSDoc comments with examples
- [ ] **Testing:** Unit tests for happy path + error cases
- [ ] **Security:** No secrets in logs, auth validation, input sanitization

---

## Example: Complete API Endpoint

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/request-context";

// 1. Schema validation
const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  ),
  shippingAddressId: z.string().uuid(),
});

/**
 * Create a new order.
 *
 * POST /api/orders
 * Authorization: Bearer <token> (required)
 * Content-Type: application/json
 *
 * Returns: { id, items, total, status, createdAt } (201 Created)
 * Errors: 400 (validation), 401 (unauthorized), 422 (insufficient inventory), 500
 *
 * Related: PRD §11 (Checkout & Orders)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = await getCorrelationId();

  try {
    // 2. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      logger.warn("orders.create.unauthorized", { correlationId });
      return NextResponse.json(
        {
          error: {
            message: "Authentication required",
            code: "UNAUTHORIZED",
          },
        },
        { status: 401 }
      );
    }

    // 3. Parse and validate input
    const body = await request.json();
    const validation = createOrderSchema.safeParse(body);

    if (!validation.success) {
      logger.warn("orders.create.validation_error", {
        correlationId,
        issues: validation.error.flatten(),
      });
      return NextResponse.json(
        {
          error: {
            message: "Request body failed validation",
            code: "VALIDATION_ERROR",
            issues: validation.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    // 4. Business logic (transactional)
    const order = await db.$transaction(async (tx) => {
      // Verify inventory
      for (const item of validation.data.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || product.stock < item.quantity) {
          throw new Error("INSUFFICIENT_INVENTORY");
        }
      }

      // Create order
      return tx.order.create({
        data: {
          userId: session.user.id,
          items: {
            create: validation.data.items,
          },
          shippingAddressId: validation.data.shippingAddressId,
          status: "pending",
        },
      });
    });

    // 5. Log success
    logger.info("order.created", {
      correlationId,
      orderId: order.id,
      total: order.total,
    });

    // 6. Return response
    return NextResponse.json(order, {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 7. Handle known errors
    if (errorMessage === "INSUFFICIENT_INVENTORY") {
      logger.warn("orders.create.insufficient_inventory", { correlationId });
      return NextResponse.json(
        {
          error: {
            message: "Insufficient inventory for one or more items",
            code: "INSUFFICIENT_INVENTORY",
          },
        },
        { status: 422 }
      );
    }

    // 8. Handle unknown errors
    logger.error("orders.create.failed", { correlationId, error });
    return NextResponse.json(
      {
        error: {
          message: "Failed to create order",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
```

---

## Related Documentation

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Code standards and conventions
- [PRD](../plans/PRD.md) — Product requirements (§4.2, §9, §11)
- [Auth Guide](../auth/README.md) — Authentication flows and token management
- [Security Guidelines](../security/README.md) — Security best practices
