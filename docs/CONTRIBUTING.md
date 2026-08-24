# Contributing to HurbadHardware

Welcome to the HurbadHardware project! This document outlines the coding standards, conventions, and practices we follow to ensure correctness, readability, and traceability across the codebase.

**Philosophy:** We prioritize correctness and security over speed. Every change is auditable, every error is traceable, and every decision is documented.

## Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Function Signatures & Documentation](#function-signatures--documentation)
3. [Error Handling](#error-handling)
4. [Async/Await & Null Handling](#asyncawait--null-handling)
5. [Logging & Correlation IDs](#logging--correlation-ids)
6. [Database & Transactions](#database--transactions)
7. [Imports & Path Aliasing](#imports--path-aliasing)
8. [Comments & Rationale](#comments--rationale)
9. [Test File Naming & Structure](#test-file-naming--structure)
10. [Tooling & Automation](#tooling--automation)
11. [Before You Commit](#before-you-commit)

---

## Naming Conventions

### Variables & Functions

Use **`camelCase`** for variable and function names.

```typescript
// ✅ Correct
const userId = user.id;
const isValidEmail = (email: string) => email.includes("@");
function getUserById(id: string) {
  return db.user.findUnique({ where: { id } });
}

// ❌ Avoid
const user_id = user.id;
const valid_email = (email: string) => email.includes("@");
function get_user_by_id(id: string) {
  return db.user.findUnique({ where: { id } });
}
```

### Types, Interfaces & Classes

Use **`PascalCase`** for type and class names.

```typescript
// ✅ Correct
interface User {
  id: string;
  email: string;
}

type ParseResult<T> = { data: T } | { error: NextResponse };

class AuditEntry {
  constructor(action: string, entity: string) {}
}

// ❌ Avoid
interface user {
  id: string;
  email: string;
}
```

### Constants

Use **`UPPER_SNAKE_CASE`** for constants.

```typescript
// ✅ Correct
const SECRET_KEY_PATTERN = /SECRET|PASSWORD|API_KEY/i;
const MAX_LIMIT = 1000;
const DEFAULT_PAGE_SIZE = 20;

// ❌ Avoid
const secretKeyPattern = /SECRET|PASSWORD|API_KEY/i;
const maxLimit = 1000;
```

### Boolean-Returning Functions

Prefix with **`is`, `has`, or `should`**.

```typescript
// ✅ Correct
function isValidEmail(email: string): boolean {}
function hasPermission(user: User, action: string): boolean {}
function shouldRefreshToken(expiresAt: Date): boolean {}

// ❌ Avoid
function validEmail(email: string): boolean {}
function userPermission(user: User, action: string): boolean {}
```

### Private/Internal Symbols

Avoid underscore prefixes. Instead, use TypeScript's `private` keyword or mark intent in comments.

```typescript
// ✅ Correct
class User {
  private email: string;
  private validateEmail() {}
}

// ❌ Avoid
class User {
  _email: string;
  _validateEmail() {}
}
```

---

## Function Signatures & Documentation

Every **exported function** must have a JSDoc comment describing its purpose, parameters, return type, and any side effects.

### JSDoc Pattern

```typescript
/**
 * Fetches a user by ID from the database.
 *
 * @param id - The unique user identifier
 * @returns The user record, or null if not found
 * @throws Will rethrow database errors (caller should handle)
 *
 * Related: PRD §4.2 (User Lookup)
 */
export async function getUserById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}
```

### Async Functions

Always mark async functions clearly in the JSDoc:

```typescript
/**
 * Validates a request body against a Zod schema.
 *
 * Asynchronous: Runs schema validation synchronously, but may call async validators.
 *
 * @param body - The request body to validate
 * @param schema - The Zod schema to validate against
 * @returns A discriminated union: { data: T } on success, { error: NextResponse } on failure
 */
export async function validateBody<T>(
  body: unknown,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  // ...
}
```

### Exemplar Files

- `src/lib/audit.ts` — Audit logging functions with JSDoc
- `src/lib/api/validate.ts` — Validation functions with return type documentation
- `src/app/api/products/route.ts` — Route handler with parameter JSDoc

---

## Error Handling

### Validation Errors (Zod)

Use Zod for schema validation. Return a **discriminated union**: `{ data: T } | { error: NextResponse }`.

```typescript
// ✅ From src/lib/api/validate.ts
export async function validateBody<T>(
  body: unknown,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            issues: result.error.flatten(),
          },
        },
        { status: 400 }
      ),
    };
  }
  return { data: result.data };
}
```

### Try-Catch in Route Handlers

Always catch errors in Route Handlers. Log with `logger.error()` and return appropriate HTTP status codes.

```typescript
// ✅ Error handling in a Route Handler
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/correlation";

export async function POST(request: Request) {
  const correlationId = getCorrelationId();

  try {
    const body = await request.json();
    const validation = await validateBody(body, productSchema);

    if ("error" in validation) {
      return validation.error;
    }

    const result = await db.product.create({ data: validation.data });
    logger.info("product.created", { correlationId, productId: result.id });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    logger.error("product.create.failed", { correlationId, error: err });
    return NextResponse.json(
      { error: { message: "Internal server error", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
```

### Error Response Shape

Always use this shape for error responses:

```typescript
type ErrorResponse = {
  error: {
    message: string; // Human-readable message
    code: string; // Machine-readable code (VALIDATION_ERROR, UNAUTHORIZED, etc.)
    issues?: unknown[]; // For validation errors, include Zod flatten output
  };
};
```

### HTTP Status Codes

- **400** — Validation error, malformed request
- **401** — Unauthorized (missing or invalid auth)
- **403** — Forbidden (authenticated but no permission)
- **404** — Not found
- **500** — Server error

**Never throw raw errors to the client.** Always wrap in a `NextResponse`.

---

## Async/Await & Null Handling

### Async Patterns

Use **`async/await`** throughout. Never use `.then()` chains or callbacks for Promise handling.

```typescript
// ✅ Correct
export async function getProductWithImages(id: string) {
  const product = await db.product.findUnique({ where: { id } });
  if (!product) return null;

  const images = await db.productImage.findMany({ where: { productId: id } });
  return { ...product, images };
}

// ❌ Avoid
export function getProductWithImages(id: string) {
  return db.product.findUnique({ where: { id } }).then((product) => {
    if (!product) return null;
    return db.productImage
      .findMany({ where: { productId: id } })
      .then((images) => ({ ...product, images }));
  });
}
```

**Error propagation:** Let errors propagate to the caller (usually a Route Handler) unless you're explicitly catching for recovery.

### Null Handling

- **Optional chaining (`?.`)**: Use when accessing properties that might be null/undefined.
- **Nullish coalescing (`??`)**: Provide defaults for null/undefined (not for falsy values).

```typescript
// ✅ Correct
const email = user?.email ?? "no-email@example.com";
const count = product?.variants?.length ?? 0;

// ❌ Avoid (using || instead of ??)
const email = user.email || "no-email@example.com"; // Fails if email is ""
const count = product?.variants?.length || 0; // Fails if length is 0

// ❌ Avoid (bare truthiness checks)
if (product) {
  // This is fine, but always be explicit for numeric/string checks:
}
if (count) {
  // WRONG: count could be 0, which is valid
}
if (count > 0) {
  // ✅ Correct: explicit comparison
}
```

---

## Logging & Correlation IDs

### Structured Logging

Every log line must carry a **`correlationId`** for request tracing. Use the logger at `src/lib/logger.ts`.

```typescript
// ✅ Correct
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/correlation";

async function processOrder(orderId: string) {
  const correlationId = getCorrelationId();
  logger.info("order.processing.started", {
    correlationId,
    orderId,
  });

  try {
    await updateOrderStatus(orderId, "processing");
    logger.info("order.processing.completed", { correlationId, orderId });
  } catch (err) {
    logger.error("order.processing.failed", {
      correlationId,
      orderId,
      error: err,
    });
  }
}
```

### Log Levels

- **`info`**: User-facing flows, successful operations
- **`warn`**: Unexpected but recoverable conditions
- **`error`**: Failures that need attention

```typescript
logger.info("user.signin.success", { correlationId, userId });
logger.warn("rate.limit.approaching", { correlationId, endpoint });
logger.error("payment.gateway.timeout", { correlationId, error });
```

### Secret Redaction

**Do not log raw API keys, passwords, tokens, or environment variable values.** The logger automatically redacts:

- Values matching `SECRET_KEY_PATTERN` (`/SECRET|PASSWORD|API_KEY/i`)
- Keys in `EXPLICIT_SECRET_KEYS` (e.g., `authorization`, `x-api-key`)

```typescript
// ✅ Correct (secrets are automatically redacted)
logger.info("request.headers", {
  correlationId,
  headers: { authorization: "Bearer secret123", "content-type": "application/json" },
});
// Output: { authorization: "[REDACTED]", "content-type": "application/json" }

// ✅ If logging a value that might contain secrets, call redact()
import { redact } from "@/lib/logger";
const sanitized = redact(apiResponse);
logger.info("api.response", { correlationId, response: sanitized });
```

**Exemplar:** `src/lib/logger.ts` (lines 14–48 show redaction logic)

---

## Database & Transactions

### Transactions for Atomicity

When writing to multiple tables, wrap in `prisma.$transaction()` to ensure atomicity.

```typescript
// ✅ Correct: Update product and audit in one transaction
export async function updateProduct(id: string, data: ProductUpdateInput) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data,
    });

    await tx.auditLog.create({
      data: {
        action: "product.update",
        entity: "Product",
        entityId: id,
        changes: JSON.stringify(data),
        reason: null,
      },
    });

    return product;
  });
}
```

### Audit Naming Convention

Use **`<entity>.<verb>`** format for audit action names.

```typescript
// ✅ Correct
"product.create";
"product.update";
"order.status_change";
"payment.refund";
"warranty.claim";

// ❌ Avoid
"create_product";
"updateProduct";
"OrderStatusChanged";
```

**Exemplar:** `src/lib/audit.ts` (see `writeAuditLog` function)

### Null in the Database

- Use `nullable: true` only for fields that can legitimately be unknown.
- Use `@default` for audit metadata.

```prisma
model Product {
  id String @id @default(cuid())
  name String
  description String?  // Can be null (legitimate)
  deletedAt DateTime?  // Can be null (not deleted)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

In application code, treat `null` explicitly:

```typescript
// ✅ Correct
const description = product.description ?? "No description provided";

// ❌ Avoid (implicit null handling)
const description = product.description || "No description provided";
```

---

## Imports & Path Aliasing

### Import Order

1. External imports (React, Next.js, third-party libraries)
2. Type imports (`import type { ... }`)
3. Path alias imports (`import ... from "@/..."`)
4. Relative imports (avoid; use path aliases instead)

```typescript
// ✅ Correct
import { useEffect, useState } from "react";
import { NextResponse } from "next/server";
import type { User } from "@/lib/db/types";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// ❌ Avoid
import { db } from "../lib/db";
import { logger } from "../../lib/logger";
import type { User } from "@/lib/db/types";
```

### Path Alias Reference

The `@/*` alias points to `src/`. Configure in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Comments & Rationale

### When to Comment

Comment the **why**, not the **what**. Code shows what it does; comments explain why.

```typescript
// ✅ Correct (explains why)
// Use raw SQL for tsvector operator Prisma doesn't support.
// Parameter substitution via prisma.$queryRaw prevents SQL injection.
const results = await db.$queryRaw<Product[]>`
  SELECT * FROM Product WHERE search_vector @@ to_tsquery('english', ${query})
`;

// ❌ Avoid (comments just restate the code)
// Get all products
const results = await db.product.findMany();
```

### PRD References

If a function or block enforces a PRD requirement, cite it:

```typescript
// PRD §0.4: Client input never trusted for price.
// Always use database value, not user-submitted price.
const product = await db.product.findUnique({ where: { id } });
const finalPrice = product.price; // Not from user input

// PRD §9.3: All audit logs must be transactional.
// Wrap data mutation and audit log in the same transaction.
await db.$transaction(async (tx) => {
  await tx.product.update({ where: { id }, data });
  await tx.auditLog.create({ data: { action: "product.update", ... } });
});
```

### Deprecation & Known Issues

Mark with `TODO:`, `FIXME:`, or `XXX:` and include the issue/decision it tracks:

```typescript
// TODO: HUR-42 - Replace with eDahab SDK once v2 is released
function processPaymentViaEdahab() {}

// FIXME: HUR-99 - Performance regression in product search; investigate index usage
export async function searchProducts(query: string) {}

// XXX: Rate limiting disabled during load test; re-enable before production cutover
// See decision log 2026-08-20
if (process.env.DISABLE_RATE_LIMIT) {
  // Disabled
}
```

---

## Test File Naming & Structure

### File Naming

Test files are **co-located** next to source files with the `.test.ts` or `.spec.ts` extension.

```
src/
  lib/
    audit.ts
    audit.test.ts       ← Co-located
  app/
    api/
      products/
        route.ts
        route.test.ts   ← Co-located
```

### Test Structure (Vitest/Jest)

Use **Arrange-Act-Assert (AAA)** pattern with one `describe()` block per module.

```typescript
// ✅ Correct
import { describe, it, expect } from "vitest";
import { validateBody } from "@/lib/api/validate";
import { productSchema } from "@/lib/api/schemas";

describe("validateBody", () => {
  it("should return data when body is valid", async () => {
    // Arrange
    const body = { name: "Test Product", price: 100 };

    // Act
    const result = await validateBody(body, productSchema);

    // Assert
    expect(result).toEqual({ data: expect.objectContaining({ name: "Test Product" }) });
  });

  it("should return error when body is invalid", async () => {
    // Arrange
    const body = { name: "Test Product" }; // Missing price

    // Act
    const result = await validateBody(body, productSchema);

    // Assert
    expect(result).toHaveProperty("error");
  });
});
```

### Async Tests

Mark async `it()` blocks:

```typescript
it("should fetch user by ID", async () => {
  const user = await getUserById("user-123");
  expect(user).toBeDefined();
});
```

---

## Tooling & Automation

### Automated Enforcement

| Standard                                | Tool                | File                 |
| --------------------------------------- | ------------------- | -------------------- |
| Formatting (spaces, quotes, semicolons) | Prettier            | `prettier.config.js` |
| Linting (no-var, const, eqeqeq)         | ESLint              | `eslint.config.mjs`  |
| TypeScript strict mode                  | TypeScript          | `tsconfig.json`      |
| Path aliases                            | TypeScript compiler | `tsconfig.json`      |
| Secret redaction in logs                | `src/lib/logger.ts` | Built into logger    |
| Pre-commit validation                   | Husky + lint-staged | `.husky/pre-commit`  |

### Manual (PR Review)

- **JSDoc presence** — Verify exported functions have JSDoc comments
- **Error handling** — Verify all async/throw operations are caught in Route Handlers
- **Naming conventions** — Verify variables, functions, types follow naming rules
- **Comments & rationale** — Verify non-obvious code is explained
- **Audit naming** — Verify audit actions follow `<entity>.<verb>` format

### Running Checks Locally

Before committing:

```bash
# Format code
npm run format

# Lint and auto-fix violations
npm run lint:fix

# Type-check
npm run typecheck

# Run tests
npm run test

# Build for production
npm run build
```

All of these run automatically on pre-commit via Husky + lint-staged.

---

## Before You Commit

**Checklist for all commits:**

- [ ] Code passes local checks: `npm run lint`, `npm run typecheck`, `npm run build`
- [ ] Exported functions have JSDoc comments
- [ ] Errors are caught in Route Handlers (not thrown to client)
- [ ] No `console.log()` calls (use `logger` instead)
- [ ] No hardcoded secrets, API keys, or env var values
- [ ] Variables/functions use `camelCase`, types use `PascalCase`
- [ ] Audit actions follow `<entity>.<verb>` format
- [ ] Database mutations are wrapped in `$transaction()`
- [ ] Nullish coalescing (`??`) used, not logical OR (`||`)
- [ ] Tests added/updated for new logic (aim for 80%+ coverage)
- [ ] No relative imports; use `@/*` path aliases

**If you're uncertain about any convention, look for an exemplar in the codebase:**

- Validation: `src/lib/api/validate.ts`
- Audit logging: `src/lib/audit.ts`
- Route handlers: `src/app/api/products/route.ts`
- Database queries: `src/lib/db.ts`

---

## Questions?

If you have questions about these standards or see inconsistencies, please open an issue or ask in the project chat. Standards evolve as the team grows; feedback is welcome.

**Related documents:**

- [PRD](docs/plans/PRD.md) — Product requirements and invariants (§0.4, §9.3, §0.5)
- [Architecture Decisions](docs/agents/learnings/architect.md) — Design patterns and trade-offs
- [Security Guidelines](docs/security/README.md) — Specific to payments, auth, and data handling
