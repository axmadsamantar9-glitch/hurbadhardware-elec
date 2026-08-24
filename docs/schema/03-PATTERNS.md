# Special Patterns: 5 Architectural Patterns

Core architectural patterns enforced at the database and application layers.

---

## 1. Immutable Order Snapshots

**What:** Once an order is placed, its pricing (subtotalUsd, discountUsd, taxUsd, totalUsd) and line item details are locked.

**Why:** Historical orders must never be mutated. If a product price changes, old orders must show the price actually paid.

**Schema Enforcement:**

- No UPDATE on Order.subtotalUsd, discountUsd, taxUsd, totalUsd
- No UPDATE on OrderItem.unitPriceUsd, nameSnapshotEn, nameSnapshotSo
- Application never issues UPDATE on these fields after placement

**Application Enforcement:**

- Order creation: Calculate and store immutable fields
- Status changes: May update Order.status, Order.paymentStatus, Order.notes only
- OrderItem snapshots: Capture product name and price at checkout, never change

**Example:**

```typescript
// Checkout: Create immutable order
const order = await db.order.create({
  data: {
    subtotalUsd: subtotal, // Locked after creation
    discountUsd: discount, // Locked
    taxUsd: tax, // Locked
    totalUsd: total, // Locked
    items: {
      create: cartItems.map((item) => ({
        unitPriceUsd: item.currentPrice, // Locked snapshot
        nameSnapshotEn: item.product.nameEn,
        nameSnapshotSo: item.product.nameSo,
      })),
    },
  },
});

// Status update: No price mutation allowed
await db.order.update({
  where: { id: order.id },
  data: { status: "SHIPPED" }, // OK
});
```

---

## 2. Audit-Log Append-Only Trigger

**What:** AuditLog table receives INSERT-only. A Postgres trigger prevents UPDATE/DELETE.

**Why:** Audit trails must be immutable for compliance, forensics, and dispute resolution.

**Schema Enforcement:**

- Postgres trigger in `prisma/migrations/manual/002_audit_log_append_only.sql` rejects UPDATE/DELETE
- Trigger raises exception BEFORE any modification

**Application Enforcement:**

- All audit writes via `src/lib/audit.ts`
- No direct `db.auditLog.update()` or `db.auditLog.delete()` calls
- Action naming: `<entity>.<verb>` (e.g., `order.status_change`)

**Trigger SQL:**

```sql
CREATE FUNCTION prevent_audit_log_modification() RETURNS TRIGGER AS $$ BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'AuditLog is append-only';
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

**Example Usage:**

```typescript
await audit({
  action: "order.status_change",
  entityType: "Order",
  entityId: order.id,
  before: { status: order.status },
  after: { status: "SHIPPED" },
  reason: "Picked and handed to courier",
});
```

---

## 3. Inventory Ledger with Signed Deltas

**What:** Stock is not directly updated. Every change (sale, restock, adjustment) is a signed delta in InventoryLog. Current stock = SUM(delta).

**Why:** Signed ledgers provide immutable audit trail of all inventory movements, enabling reconciliation and forensics.

**Schema Enforcement:**

- InventoryLog is append-only
- Product.stockQuantity is denormalized sum
- No direct UPDATE to Product.stockQuantity

**Application Enforcement:**

- Every stock change creates InventoryLog entry
- delta is negative for sales, positive for restocks
- reason documents why: "ORDER-{orderId}", "RESTOCK", "INVENTORY_ADJUSTMENT", etc.
- Current stock: SELECT SUM(delta) FROM inventory_logs WHERE product_id = ?

**Example Ledger:**

```
Entry 1: +100, "RESTOCK", 2026-08-01
Entry 2: -2, "ORDER-abc123", 2026-08-02
Entry 3: -1, "ORDER-def456", 2026-08-02
Entry 4: -3, "INVENTORY_ADJUSTMENT", 2026-08-03
Entry 5: +5, "RESTOCK", 2026-08-04

Current stock = 100 - 2 - 1 - 3 + 5 = 99
```

**Example Queries:**

```sql
-- Current stock
SELECT SUM(delta) FROM inventory_logs WHERE product_id = 'prod-123';

-- Daily audit
SELECT DATE(created_at), SUM(delta) FROM inventory_logs
WHERE product_id = 'prod-123' GROUP BY DATE(created_at);
```

---

## 4. Generated tsvector for Full-Text Search

**What:** Product.searchVector is a Postgres GENERATED column built from product names (en/so), descriptions (en/so), and brand. Indexed with GIN.

**Why:** Database-level FTS is fast, supports bilingual search, and scales better than application filtering.

**Schema Enforcement:**

- GENERATED ALWAYS AS (...) STORED: computed automatically
- GIN index for fast substring and phrase search
- Prisma marks as Unsupported("tsvector"); real definition in manual migration 001_search_vector.sql

**Manual Migration SQL:**

```sql
ALTER TABLE products ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', COALESCE(name_en, '')), 'A')
  || setweight(to_tsvector('somali', COALESCE(name_so, '')), 'A')
  || setweight(to_tsvector('english', COALESCE(description_en, '')), 'B')
  || setweight(to_tsvector('english', COALESCE(brand, '')), 'C')
) STORED;

CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);
```

**Example Query:**

```sql
SELECT id, name_en, name_so FROM products
WHERE search_vector @@ to_tsquery('english', 'laptop')
ORDER BY ts_rank(search_vector, to_tsquery('english', 'laptop')) DESC LIMIT 10;
```

---

## 5. Internationalization (i18n) Field Pairs

**What:** Text content stored in separate _en and _so fields, never mixed.

**Why:** Separating languages simplifies queries, eliminates JSON column overhead, ensures consistency.

**Schema Enforcement:**

- All translatable text: `<field>_en` and `<field>_so`
- Prisma @map keeps underscore naming in Postgres
- Application never stores both languages in one field

**Models with i18n:**

- Category: nameEn, nameSo
- Product: nameEn, nameSo, descriptionEn, descriptionSo
- ProductImage: altEn, altSo
- ProductSpec: keyEn, keySo, valueEn, valueSo
- OrderItem: nameSnapshotEn, nameSnapshotSo

**Application Enforcement:**

- URL routing: /en/ or /so/ locale prefix enforced by middleware
- On read: return the _en or _so value matching user.locale
- On write: admin provides both _en and _so; never allow one null if other set
- On checkout: snapshot both languages into OrderItem (for order history accuracy)

**Example Code:**

```typescript
// On read: localize per user language
function localizeCategory(cat, userLocale) {
  return { id: cat.id, name: userLocale === "en" ? cat.nameEn : cat.nameSo };
}

// On write: require both
async function createProduct(input) {
  if (!input.nameEn || !input.nameSo) throw new Error("Both languages required");
  return db.product.create({ data: input });
}

// On checkout: snapshot both
const orderItem = {
  nameSnapshotEn: product.nameEn, // Always both
  nameSnapshotSo: product.nameSo, // regardless of locale
};
```

---

## Summary

| Pattern             | Enforcement                    | Reason                 |
| ------------------- | ------------------------------ | ---------------------- |
| Immutable snapshots | No UPDATE after placement      | Historical accuracy    |
| Audit-only          | Postgres trigger + APPEND-ONLY | Compliance & forensics |
| Inventory ledger    | APPEND-ONLY + SUM for current  | Reconciliation audit   |
| tsvector FTS        | GENERATED + GIN index          | Fast bilingual search  |
| i18n pairs          | Separate _en/_so fields        | Bilingual consistency  |

All patterns enforced at database (constraints, triggers) and application (business logic) layers.
