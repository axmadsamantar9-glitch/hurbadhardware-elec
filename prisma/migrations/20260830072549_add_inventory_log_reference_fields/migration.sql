-- Adds nullable reference_type/reference_id to inventory_logs (HUB-29),
-- mirroring audit_logs' entityType/entityId pattern. The
-- "DROP INDEX products_search_vector_idx" / "ALTER COLUMN search_vector DROP
-- DEFAULT" pair Prisma auto-generated for this diff has been intentionally
-- omitted -- recurring false-positive artifact of the Unsupported("tsvector")
-- column, see docs/agents/learnings/storefront.md. schema.prisma has no
-- actual change to search_vector here.

-- AlterTable
ALTER TABLE "inventory_logs" ADD COLUMN     "reference_id" TEXT,
ADD COLUMN     "reference_type" TEXT;
