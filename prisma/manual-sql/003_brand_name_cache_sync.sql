-- ---------------------------------------------------------------------------
-- Brand name cache sync + search_vector rebuild (HUB-26 Step 4)
--
-- WHY THIS FILE EXISTS
-- `products.brand_name_cache` is a denormalized copy of `brands.name_en`,
-- introduced because the generated `products.search_vector` tsvector column
-- (see 001_search_vector.sql) cannot express a cross-table JOIN — Postgres
-- `GENERATED ALWAYS AS (...) STORED` expressions may only reference columns
-- on the same row. `brand_name_cache` lets `search_vector` keep matching on
-- brand text after `products.brand` (free text) is superseded by
-- `products.brand_id` (FK to `brands`).
--
-- This file is never written by application code. Prisma's schema.prisma
-- has no way to express either a cross-table sync trigger or a raw
-- GENERATED column definition, so both live here as documentation, and the
-- actual SQL is folded by hand into the migration listed below (the same
-- convention as 001_search_vector.sql and 002_audit_log_append_only.sql).
--
-- HOW IT WAS APPLIED
--   1. `npx prisma migrate dev --create-only --name
--      add_brand_sync_triggers_and_rebuild_search_vector` (schema.prisma
--      does not change here — searchVector stays Unsupported("tsvector")? —
--      so this produced an empty migration.sql).
--   2. This file's SQL was hand-copied into that migration's migration.sql,
--      in the order below (triggers first, then the column rebuild, so the
--      BEFORE INSERT/UPDATE trigger exists before the column is redefined).
--   3. Applied with `npx prisma migrate dev`.
--
-- After that this file is documentation only; do not run it twice.
-- ---------------------------------------------------------------------------

-- 1. BEFORE INSERT OR UPDATE OF brand_id ON products
--    Populates NEW.brand_name_cache from brands.name_en for the new
--    brand_id (NULL if brand_id is NULL).
CREATE OR REPLACE FUNCTION sync_product_brand_name_cache()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."brand_id" IS NULL THEN
    NEW."brand_name_cache" := NULL;
  ELSE
    SELECT "name_en" INTO NEW."brand_name_cache"
    FROM "brands"
    WHERE "id" = NEW."brand_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_brand_name_cache_sync
  BEFORE INSERT OR UPDATE OF "brand_id" ON "products"
  FOR EACH ROW EXECUTE FUNCTION sync_product_brand_name_cache();

-- 2. AFTER UPDATE OF name_en ON brands
--    Cascades a brand rename to every product currently pointing at it.
CREATE OR REPLACE FUNCTION cascade_brand_name_rename()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "products"
  SET "brand_name_cache" = NEW."name_en"
  WHERE "brand_id" = NEW."id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brands_cascade_name_rename
  AFTER UPDATE OF "name_en" ON "brands"
  FOR EACH ROW EXECUTE FUNCTION cascade_brand_name_rename();

-- 3. Rebuild search_vector to reference brand_name_cache instead of brand.
-- Same weighted structure/config ('simple') as 001_search_vector.sql — only
-- the brand column reference changes.
DROP INDEX "products_search_vector_idx";
ALTER TABLE "products" DROP COLUMN "search_vector";

ALTER TABLE "products"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name_en", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("name_so", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("brand_name_cache", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("description_en", '')), 'C')
  ) STORED;

CREATE INDEX "products_search_vector_idx"
  ON "products"
  USING GIN ("search_vector");
