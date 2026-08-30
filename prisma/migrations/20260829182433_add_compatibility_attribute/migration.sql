-- HUB-28: Compatibility model (PRD §5.2). Purely additive — no existing
-- table is altered destructively and no data is migrated (zero
-- CompatibilityAttribute-equivalent rows exist today, confirmed by
-- product-planning's investigation: no Compatibility/CompatibilityWarning
-- model exists anywhere in the schema or codebase), so this is a
-- single-step migration with no destructive operations and needs no second
-- human checkpoint (contrast with HUB-26's drop-column step).
--
-- NOTE: `prisma migrate diff` against this schema always also emits
-- `DROP INDEX "products_search_vector_idx"` / `ALTER COLUMN "search_vector"
-- DROP DEFAULT` as false drift because `searchVector` is
-- `Unsupported("tsvector")?` — Prisma can never fully reconcile a manually
-- managed GENERATED column against its own model. Both statements are
-- deliberately omitted here; the generated column and its index are
-- untouched by this migration. See docs/agents/learnings/storefront.md.

-- CreateEnum
CREATE TYPE "compatibility_type" AS ENUM ('DEVICE', 'CONNECTOR', 'OS_SUPPORT', 'POWER', 'CONSUMABLE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "compatibility_warning_en" TEXT,
ADD COLUMN     "compatibility_warning_so" TEXT;

-- CreateTable
CREATE TABLE "compatibility_attributes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "compatibility_type" NOT NULL,
    "value_slug" TEXT NOT NULL,
    "value_en" TEXT NOT NULL,
    "value_so" TEXT NOT NULL,
    "warning_en" TEXT,
    "warning_so" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compatibility_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compatibility_attributes_product_id_idx" ON "compatibility_attributes"("product_id");

-- CreateIndex
CREATE INDEX "compatibility_attributes_type_value_slug_idx" ON "compatibility_attributes"("type", "value_slug");

-- CreateIndex
CREATE UNIQUE INDEX "compatibility_attributes_product_id_type_value_slug_key" ON "compatibility_attributes"("product_id", "type", "value_slug");

-- AddForeignKey
ALTER TABLE "compatibility_attributes" ADD CONSTRAINT "compatibility_attributes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
