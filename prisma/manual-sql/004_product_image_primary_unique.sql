-- ---------------------------------------------------------------------------
-- Enforce exactly one primary image per product (HUB-28)
--
-- WHY THIS FILE EXISTS
-- ProductImage.isPrimary is a plain Boolean column with no schema-level
-- guarantee that at most one row per product has isPrimary = true. Prisma
-- has no way to express a partial unique index (`WHERE` clause) in
-- schema.prisma, so this lives here as documentation and is folded by hand
-- into a migration, same convention as 001_search_vector.sql,
-- 002_audit_log_append_only.sql and 003_brand_name_cache_sync.sql.
--
-- HOW IT WAS APPLIED
--   1. `npx prisma migrate dev --create-only --name
--      add_product_image_one_primary_per_product` (schema.prisma does not
--      change here, so this produced an empty migration.sql aside from the
--      usual false tsvector-drift statements, which were stripped per the
--      storefront learnings entry on that recurring issue).
--   2. This file's SQL was hand-copied into that migration's migration.sql.
--   3. Applied with `npx prisma migrate deploy` (non-interactive).
--
-- After that this file is documentation only; do not run it twice.
--
-- A partial unique index (rather than a full unique constraint on
-- product_id, which would forbid more than one image per product entirely)
-- only enforces uniqueness among rows where is_primary is true — a product
-- may have any number of non-primary images, but never more than one
-- primary image.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "product_image_one_primary_per_product"
  ON "product_images" ("product_id")
  WHERE "is_primary" = true;
