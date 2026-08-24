# HurbadHardware Database Schema Reference

**Last Updated:** 2026-08-24  
**Schema Version:** 2.0  
**Authority:** Single source of truth (extracted from `prisma/schema.prisma`)  
**Audience:** Internal developers, maintainers, architects

## Overview

This directory contains comprehensive documentation of the HurbadHardware data model — the schema that powers the entire e-commerce platform. It covers all 22 models, 11 enums, foreign key relationships, indexes, and special patterns that enforce business rules and data integrity.

The schema is the **single source of truth** for data structure. When documentation contradicts `prisma/schema.prisma`, the schema wins; fix the documentation, never the schema.

## Quick Model Map

### Identity & Auth (5 models)

- **User** — Platform users (customers and admins)
- **Account** — Auth.js OAuth provider links
- **Session** — Database session storage for Auth.js
- **VerificationToken** — Email verification and password reset tokens
- **Address** — Shipping and billing addresses

### Catalog (6 models)

- **Category** — Product categories with hierarchy support
- **Product** — Catalog items with pricing, media, and full-text search
- **ProductImage** — Product photos and media assets
- **ProductSpec** — Structured product specifications (key-value pairs)
- **ProductVariant** — Product size/color/variant combinations
- **Review** — Customer product reviews and ratings

### Shopping & Carts (4 models)

- **Cart** — Guest and user shopping carts
- **CartItem** — Individual items in a cart
- **Wishlist** — Saved items for later purchase
- **Coupon** — Promotional discounts (fixed or percent)

### Orders & Payments (7 models)

- **Order** — Customer orders with pricing snapshots
- **OrderItem** — Line items in an order (immutable snapshots)
- **Payment** — Payment transaction records per gateway
- **FxRate** — Exchange rate cache (USD ↔ KES)
- **WhatsappSession** — WhatsApp commerce conversation state
- **InventoryLog** — Signed inventory deltas (ledger)
- **AuditLog** — Append-only audit trail for sensitive actions

## Key Statistics

| Category         | Count | Notes                                   |
| ---------------- | ----- | --------------------------------------- |
| Models           | 22    | All entities documented                 |
| Enums            | 11    | Type-safe state and categorization      |
| Relationships    | 25+   | Foreign keys with cascade/setNull rules |
| Indexes          | 30+   | Performance and uniqueness constraints  |
| Special Patterns | 5     | Immutability, audit, ledger, FTS, i18n  |

## How to Use This Documentation

**For an overview of the data model:**  
Start here, then read `01-MODELS.md`.

**To understand a specific model:**  
Go to `01-MODELS.md`, search for the model name. Each entry includes fields, relationships, constraints, and example JSON.

**To find all values of an enum:**  
See `02-ENUMS.md`. Lists all 11 enums with descriptions and usage examples.

**To understand immutability, audit trails, or other patterns:**  
See `03-PATTERNS.md`. Documents all 5 architectural patterns with schema enforcement and application requirements.

**To visualize relationships between models:**  
See `04-ER-DIAGRAM.md`. Mermaid diagram with all 22 entities and cardinality notation.

**To understand migrations and rollback safety:**  
See `05-MIGRATIONS.md`. Overview of migration strategy, manual migrations, and seed data.

## Permanent Design Principles

1. **Money is always Decimal, never Float.**  
   USD: `Decimal(10,2)` | KES: `Decimal(12,2)` | FX rates: `Decimal(14,6)`

2. **Historical orders are immutable snapshots.**  
   Once an order is `PLACED`, its prices, taxes, items cannot change. Only audit trails, status, and fulfillment notes can be updated.

3. **Third-party providers are isolated behind adapters.**  
   Payment gateways, email, WhatsApp, storage must not leak into business logic. Each adapter exports a provider-neutral interface.

4. **Internationalization is consistent.**  
   Text fields follow the pattern: `<field>_en` and `<field>_so`. Locale routing is middleware-enforced; content is stored separately, never mixed.

5. **Audit trails are append-only.**  
   Sensitive actions (admin changes, order updates, inventory adjustments) are logged to an append-only table. The database enforces write-only via trigger.

6. **Inventory is tracked as a ledger of signed deltas.**  
   Stock quantity is the SUM of all `InventoryLog` deltas. Negative entries represent sales; positive entries represent restocks.

7. **Full-text search is database-backed.**  
   `Product.searchVector` is a Postgres `GENERATED ALWAYS AS` tsvector, indexed with GIN for fast text search.

## Consistency Rules

- **Schema is authoritative.** All field names, types, nullability, defaults, and precision values in this documentation must match `prisma/schema.prisma` exactly.
- **No manual schema edits.** Updates to the data model must go through Prisma migrations (`prisma migrate dev` or `prisma migrate create`).
- **Migrations are reversible.** Every migration must have a corresponding rollback strategy.
- **Foreign keys are cascade or setNull.** No dangling references; deletions propagate cleanly.

## Next Steps

- **Read `01-MODELS.md`** for detailed field-level documentation of all 22 models.
- **Read `02-ENUMS.md`** for all enum values and their usage.
- **Read `03-PATTERNS.md`** for immutability, audit, ledger, tsvector, and i18n patterns.
- **Read `04-ER-DIAGRAM.md`** for a visual relationship diagram.
- **Read `05-MIGRATIONS.md`** for migration and seed strategies.

---

**Questions or discrepancies?** Check `prisma/schema.prisma` first (the source of truth), then file an issue if documentation is out of sync.
