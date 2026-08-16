-- ---------------------------------------------------------------------------
-- Product full-text search vector (U2)
--
-- WHY THIS FILE EXISTS
-- Prisma cannot express a Postgres `GENERATED ALWAYS AS (...) STORED` column,
-- so `Product.searchVector` is declared in schema.prisma as
-- `Unsupported("tsvector")?`. Prisma will therefore emit a plain
-- `"search_vector" tsvector` column in the generated migration, which is NOT
-- what we want — it would never be populated.
--
-- HOW TO APPLY IT
-- No database is provisioned yet, so no baseline migration exists. When the
-- first real migration is created:
--
--   1. Run `npx prisma migrate dev --create-only --name init`.
--   2. Open the generated
--      `prisma/migrations/<timestamp>_init/migration.sql`.
--   3. DELETE the plain `"search_vector" tsvector,` line from the
--      `CREATE TABLE "products"` statement.
--   4. Append the two statements below to the end of that migration file.
--   5. Run `npx prisma migrate dev` to apply.
--
-- After that this file is documentation only; do not run it twice.
-- `prisma migrate` never executes files under migrations/manual/ — that
-- directory has no `migration.sql` and no checksum entry, so it is invisible
-- to the migration engine.
--
-- WEIGHTS
--   A  name_en, name_so   — product names rank highest
--   B  brand              — brand matches rank next
--   C  description_en     — description matches rank lowest
-- 'simple' (not 'english') is used deliberately: Somali has no Postgres
-- stemmer, and applying English stemming to Somali text produces wrong
-- lexemes. 'simple' just lowercases and strips punctuation, which behaves
-- acceptably for both languages.
-- ---------------------------------------------------------------------------

ALTER TABLE "products"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name_en", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("name_so", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("brand", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("description_en", '')), 'C')
  ) STORED;

CREATE INDEX "products_search_vector_idx"
  ON "products"
  USING GIN ("search_vector");
