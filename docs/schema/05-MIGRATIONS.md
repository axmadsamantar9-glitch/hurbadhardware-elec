# Migrations & Seed Strategy

Overview of migration strategy, manual migrations, and seed data.

---

## Migration Strategy

### Prisma Migrate (Automatic)

Most schema changes use Prisma Migrate:

```bash
prisma migrate dev --name <description>
prisma migrate deploy  # In production
```

Supports: add/remove models, add/remove fields, modify types, add/remove FKs, indexes, unique constraints.

### Manual Migrations

Certain features require raw SQL:

| Migration                 | File                                                   | Purpose                   |
| ------------------------- | ------------------------------------------------------ | ------------------------- |
| 001_search_vector         | prisma/migrations/manual/001_search_vector.sql         | Full-text search tsvector |
| 002_audit_log_append_only | prisma/migrations/manual/002_audit_log_append_only.sql | Append-only audit trigger |

---

## Manual Migration 001: Full-Text Search Vector

**File:** prisma/migrations/manual/001_search_vector.sql

**Purpose:** Add Postgres GENERATED tsvector column for full-text search.

**SQL:**

```
ALTER TABLE products
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', name_en), 'A')
  || setweight(to_tsvector('somali', name_so), 'A')
  || setweight(to_tsvector('english', description_en), 'B')
  || setweight(to_tsvector('english', brand), 'C')
) STORED;

CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);
```

**Why Manual?** Prisma cannot express GENERATED ALWAYS AS.

**Rollback:**

```
DROP INDEX idx_products_search_vector;
ALTER TABLE products DROP COLUMN search_vector;
```

---

## Manual Migration 002: Audit-Log Append-Only Trigger

**File:** prisma/migrations/manual/002_audit_log_append_only.sql

**Purpose:** Enforce AuditLog is append-only (INSERT-only; no UPDATE/DELETE).

**SQL:**

```
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'AuditLog is append-only';
  END IF;
  RETURN NULL;
END;
$function$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
```

**Why Manual?** Prisma has no syntax for triggers.

**Rollback:**

```
DROP TRIGGER audit_log_append_only ON audit_logs;
DROP FUNCTION prevent_audit_log_modification();
```

---

## Seed Data Strategy

**File:** prisma/seed.ts

Seed is loaded on `prisma migrate dev` or `prisma db seed`.

### Seed Contents

| Entity         | Count | Purpose             |
| -------------- | ----- | ------------------- |
| User (admin)   | 1     | Admin account       |
| Category       | 8     | Product categories  |
| Product        | 40    | Sample electronics  |
| ProductImage   | 80+   | Product photos      |
| ProductSpec    | 120+  | Product specs       |
| ProductVariant | 60+   | Size/color variants |
| Coupon         | 2     | Promo codes         |

### Idempotent Upserts

All seed operations use upsert to avoid duplicates:

```typescript
await prisma.category.upsert({
  where: { slug: "laptops" },
  update: { nameEn: "Laptops" },
  create: { nameEn: "Laptops", nameSo: "...", slug: "laptops" },
});
```

### Running Seed

```bash
prisma migrate dev  # Seed on migrate
prisma db seed     # Seed explicitly
prisma migrate reset  # Reset and seed
```

---

## Rollback Safety

### Principles

1. **Orders preserved:** Cascade uses SETNULL for order FKs so deleting user/address/coupon preserves order.
2. **Snapshots protect data:** OrderItem snapshots (nameSnapshotEn/So, unitPriceUsd) preserve historical state.
3. **Audit immutable:** Once written, audit logs cannot be modified.
4. **Inventory append-only:** Stock adjustments never deleted; corrections are new deltas.

### Rollback Strategies

**If you add a field:**

```bash
prisma migrate resolve --rolled-back <migration-name>
prisma migrate dev
```

**If you revert a schema change:**

```bash
prisma migrate resolve --rolled-back <migration-name>
# Fix schema.prisma
prisma migrate dev
```

**If you delete data:**

- Database backups are only recourse
- Audit trail helps identify what changed

### Testing Rollback

```bash
prisma migrate reset  # Clears data, re-seeds
# Verify tests pass
```

---

## Migration Checklist

Before committing:

- [ ] Change in prisma/schema.prisma
- [ ] Migration generated: prisma migrate dev --name <description>
- [ ] Migration reviewed
- [ ] Application code updated
- [ ] Indexes added for performance
- [ ] Constraints added for integrity
- [ ] docs/schema/ updated
- [ ] Seed data includes examples
- [ ] Rollback strategy clear
- [ ] Tests pass
- [ ] Manual migration (if needed) in prisma/migrations/manual/

---

## Common Patterns

### Add Required Field (No Default)

**Challenge:** Existing rows have NULL; field is not nullable.

**Solution:** Add optional first, backfill, then make required.

```prisma
// Step 1
newField String?

// Step 2: Backfill in app
await prisma.product.updateMany({
  data: { newField: 'default-value' },
});

// Step 3
newField String
```

### Add Foreign Key

**Risk:** Existing rows have NULL for new FK.

**Mitigation:** Start optional, backfill, then make required.

### Add Unique Constraint

**Risk:** Existing duplicates.

**Check first:**

```sql
SELECT sku, COUNT(*) FROM products GROUP BY sku HAVING COUNT(*) > 1;
```

### Add Index

**Risk:** Index creation locks table on large tables.

**Mitigation:** Use CONCURRENTLY in raw SQL (Prisma doesn't support):

```sql
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
```

---

## Manual Migrations in Production

```bash
psql $DATABASE_URL -f prisma/migrations/manual/001_search_vector.sql
psql $DATABASE_URL -f prisma/migrations/manual/002_audit_log_append_only.sql
```

**Important:** Make idempotent with IF NOT EXISTS:

```sql
-- Good
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN (search_vector);

-- Avoid
CREATE INDEX idx_products_search_vector ON products USING GIN (search_vector);
```

---

## Monitoring

```bash
prisma migrate status  # Show pending migrations
cat prisma/migrations/20240824120000_<name>/migration.sql  # Show details
cat prisma/seed.ts  # Show seed script
```

---

## Summary

| Task           | Tool           | File                                                   |
| -------------- | -------------- | ------------------------------------------------------ |
| Schema changes | Prisma Migrate | prisma/migrations/                                     |
| FTS vector     | Manual SQL     | prisma/migrations/manual/001_search_vector.sql         |
| Audit trigger  | Manual SQL     | prisma/migrations/manual/002_audit_log_append_only.sql |
| Seed data      | Prisma         | prisma/seed.ts                                         |
| Rollback       | Git + Prisma   | git revert + prisma migrate resolve                    |

All migrations are version-controlled and reversible.
