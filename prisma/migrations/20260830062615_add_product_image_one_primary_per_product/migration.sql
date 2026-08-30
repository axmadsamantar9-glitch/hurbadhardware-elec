-- Enforce exactly one primary image per product (HUB-28). See
-- prisma/manual-sql/004_product_image_primary_unique.sql for the full
-- rationale. The false "DROP INDEX products_search_vector_idx" /
-- "ALTER COLUMN search_vector DROP DEFAULT" pair that Prisma auto-generated
-- for this diff (a recurring artifact of the Unsupported("tsvector") column
-- — see docs/agents/learnings/storefront.md) has been intentionally
-- omitted; schema.prisma has no actual change here.

CREATE UNIQUE INDEX "product_image_one_primary_per_product"
  ON "product_images" ("product_id")
  WHERE "is_primary" = true;
