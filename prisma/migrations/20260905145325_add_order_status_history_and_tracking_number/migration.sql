-- The "DROP INDEX products_search_vector_idx" / "ALTER COLUMN search_vector
-- DROP DEFAULT" pair Prisma auto-generated for this diff has been
-- intentionally omitted -- recurring false-positive artifact of the
-- Unsupported("tsvector") column, see docs/agents/learnings/storefront.md.
-- schema.prisma has no actual change to search_vector here.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "tracking_number" TEXT;

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every pre-existing order gets exactly one history row matching
-- its current status/createdAt, so the timeline never renders empty for
-- orders created before this migration (HUB-39). Idempotent (NOT EXISTS
-- guard) so re-running this migration file is safe.
INSERT INTO order_status_history (id, order_id, status, created_at)
SELECT gen_random_uuid()::text, o.id, o.status, o.created_at
FROM orders o
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
);
