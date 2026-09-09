-- CreateEnum
CREATE TYPE "warranty_status" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'VOID', 'NOT_COVERED');

-- CreateEnum
CREATE TYPE "warranty_registration_source" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "warranty_responsible_party" AS ENUM ('MANUFACTURER', 'SUPPLIER', 'HURBAD_HARDWARE');

-- CreateEnum
CREATE TYPE "warranty_eligibility_decision" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE');

-- CreateEnum
CREATE TYPE "warranty_claim_status" AS ENUM ('REQUESTED', 'ELIGIBILITY_REVIEW', 'APPROVED', 'REJECTED', 'TROUBLESHOOTING', 'SERVICE_REPAIR', 'REPLACEMENT', 'REFUND', 'COMPLETED', 'CLOSED');

-- AlterTable
-- NOTE: Prisma's diff engine always proposes `DROP INDEX
-- "products_search_vector_idx"` + `ALTER COLUMN "search_vector" DROP
-- DEFAULT` here because `Product.searchVector` is an `Unsupported("tsvector")`
-- GENERATED column managed outside Prisma's tracking (see schema.prisma's
-- header comment and prisma/manual-sql/001_search_vector.sql /
-- 003_brand_name_cache_sync.sql). This is known false drift, not a real
-- change requested by this migration -- deliberately stripped here, same as
-- every prior migration that touched an unrelated model (see
-- docs/agents/learnings/architect.md). The GIN index and generated column
-- are left untouched.
ALTER TABLE "products" ADD COLUMN     "warranty_months" INTEGER;

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "user_id" TEXT,
    "product_id" TEXT,
    "variant_id" TEXT,
    "sku_snapshot" TEXT,
    "product_name_snapshot_en" TEXT NOT NULL,
    "product_name_snapshot_so" TEXT NOT NULL,
    "serial_number" TEXT,
    "warranty_months_snapshot" INTEGER,
    "coverage_terms_en" TEXT,
    "coverage_terms_so" TEXT,
    "exclusions_en" TEXT,
    "exclusions_so" TEXT,
    "coverage_notes_en" TEXT,
    "coverage_notes_so" TEXT,
    "responsible_party" "warranty_responsible_party",
    "purchase_date" TIMESTAMP(3),
    "delivery_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "status" "warranty_status" NOT NULL DEFAULT 'NOT_COVERED',
    "registration_source" "warranty_registration_source" NOT NULL,
    "registered_by_user_id" TEXT,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" TEXT NOT NULL,
    "warranty_id" TEXT NOT NULL,
    "user_id" TEXT,
    "status" "warranty_claim_status" NOT NULL DEFAULT 'REQUESTED',
    "claim_reason" TEXT NOT NULL,
    "customer_description" TEXT,
    "eligibility_decision" "warranty_eligibility_decision",
    "eligibility_reason" TEXT,
    "eligibility_decided_by" TEXT,
    "eligibility_decided_at" TIMESTAMP(3),
    "diagnostic_findings" TEXT,
    "parts_service_used" TEXT,
    "repair_cost_usd" DECIMAL(10,2),
    "repair_responsible_party" "warranty_responsible_party",
    "replacement_product_id" TEXT,
    "replacement_serial_number" TEXT,
    "refund_amount_usd" DECIMAL(10,2),
    "sla_target_date" TIMESTAMP(3),
    "resolution_reason" TEXT,
    "closed_at" TIMESTAMP(3),
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claim_messages" (
    "id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "author_user_id" TEXT,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_claim_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranties_order_item_id_key" ON "warranties"("order_item_id");

-- CreateIndex
CREATE INDEX "warranties_user_id_idx" ON "warranties"("user_id");

-- CreateIndex
CREATE INDEX "warranties_order_id_idx" ON "warranties"("order_id");

-- CreateIndex
CREATE INDEX "warranties_product_id_idx" ON "warranties"("product_id");

-- CreateIndex
CREATE INDEX "warranties_status_idx" ON "warranties"("status");

-- CreateIndex
CREATE INDEX "warranties_serial_number_idx" ON "warranties"("serial_number");

-- CreateIndex
CREATE INDEX "warranty_claims_warranty_id_idx" ON "warranty_claims"("warranty_id");

-- CreateIndex
CREATE INDEX "warranty_claims_user_id_idx" ON "warranty_claims"("user_id");

-- CreateIndex
CREATE INDEX "warranty_claims_status_idx" ON "warranty_claims"("status");

-- CreateIndex
CREATE INDEX "warranty_claim_messages_claim_id_created_at_idx" ON "warranty_claim_messages"("claim_id", "created_at");

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_replacement_product_id_fkey" FOREIGN KEY ("replacement_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claim_messages" ADD CONSTRAINT "warranty_claim_messages_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "warranty_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claim_messages" ADD CONSTRAINT "warranty_claim_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
