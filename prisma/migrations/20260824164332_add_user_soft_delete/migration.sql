-- NOTE (qa-test, HUR-172): Prisma's auto-generated diff for this migration
-- originally also included `DROP INDEX "products_search_vector_idx"` and
-- `ALTER TABLE "products" ALTER COLUMN "search_vector" DROP DEFAULT`. Those
-- two statements are unrelated to this change — they are Prisma trying to
-- "fix" pre-existing drift on the manually-managed generated tsvector column
-- documented at the top of prisma/schema.prisma (search_vector is declared
-- Unsupported("tsvector") and its real definition + GIN index live in
-- prisma/migrations/manual/001_search_vector.sql, outside Prisma's tracking).
-- Applying them would have dropped a live full-text-search index in
-- production. They have been removed from this migration; only the additive
-- User.deletedAt change (this issue's actual scope) remains below.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
