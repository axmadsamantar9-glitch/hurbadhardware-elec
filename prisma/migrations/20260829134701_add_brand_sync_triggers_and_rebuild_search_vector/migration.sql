-- Hand-written migration (HUB-26 Step 4). schema.prisma does not change here
-- (searchVector stays Unsupported("tsvector")?), so Prisma's auto-generated
-- diff for this migration would have only been the same false search_vector
-- "drift fix" seen in prior migrations (DROP INDEX
-- products_search_vector_idx / ALTER COLUMN search_vector DROP DEFAULT) —
-- both discarded. The actual content below is copied from
-- prisma/manual-sql/003_brand_name_cache_sync.sql; see that file for full
-- rationale and the weights/config carried over unchanged from
-- prisma/manual-sql/001_search_vector.sql.

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
