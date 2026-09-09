-- CreateEnum
CREATE TYPE "rma_status" AS ENUM ('REQUESTED', 'REVIEW', 'APPROVED', 'REJECTED', 'RECEIVED', 'INSPECTING', 'REPAIR', 'REPLACE', 'REFUND', 'COMPLETED');

-- CreateEnum
CREATE TYPE "product_condition" AS ENUM ('NEW', 'OPEN_BOX', 'REFURBISHED', 'USED');

-- NOTE: `prisma migrate dev --create-only` bundled the known false-positive
-- search_vector drift noise (DROP INDEX products_search_vector_idx + ALTER
-- COLUMN search_vector DROP DEFAULT) even though this migration makes zero
-- intentional changes to `products`. Trimmed by hand per the precedent in
-- docs/agents/learnings/architect.md and docs/agents/learnings/admin-ops.md
-- -- the generated column and its GIN index are never actually touched.

-- CreateTable
CREATE TABLE "rma_requests" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "status" "rma_status" NOT NULL DEFAULT 'REQUESTED',
    "condition_on_receipt" "product_condition",
    "inspection_notes" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "inspected_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rma_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rma_status_history" (
    "id" TEXT NOT NULL,
    "rma_id" TEXT NOT NULL,
    "status" "rma_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rma_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rma_requests_claim_id_key" ON "rma_requests"("claim_id");

-- CreateIndex
CREATE INDEX "rma_requests_status_idx" ON "rma_requests"("status");

-- CreateIndex
CREATE INDEX "rma_status_history_rma_id_created_at_idx" ON "rma_status_history"("rma_id", "created_at");

-- AddForeignKey
ALTER TABLE "rma_requests" ADD CONSTRAINT "rma_requests_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "warranty_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rma_status_history" ADD CONSTRAINT "rma_status_history_rma_id_fkey" FOREIGN KEY ("rma_id") REFERENCES "rma_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
