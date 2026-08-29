-- NOTE (storefront, HUB-26): Prisma's auto-generated diff also included
-- `DROP INDEX "products_search_vector_idx"` and
-- `ALTER TABLE "products" ALTER COLUMN "search_vector" DROP DEFAULT`. Those
-- are Prisma trying to "fix" pre-existing drift on the manually-managed
-- generated tsvector column (declared Unsupported("tsvector") in
-- schema.prisma; real definition + GIN index live in
-- prisma/manual-sql/001_search_vector.sql, outside Prisma's tracking — see
-- the identical note in 20260824164332_add_user_soft_delete/migration.sql).
-- Applying them here would drop the live full-text-search index. They have
-- been removed; only the additive brand/manufacturer columns remain below.
-- The search_vector column itself is rebuilt in a later migration (Step 4,
-- 003_brand_name_cache_sync.sql) to reference brand_name_cache instead of
-- brand.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand_id" TEXT,
ADD COLUMN     "brand_name_cache" TEXT,
ADD COLUMN     "manufacturer_id" TEXT;

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_so" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_so" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_suppliers" (
    "product_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,

    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("product_id","supplier_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_is_active_idx" ON "brands"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_slug_key" ON "manufacturers"("slug");

-- CreateIndex
CREATE INDEX "manufacturers_is_active_idx" ON "manufacturers"("is_active");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE INDEX "product_suppliers_supplier_id_idx" ON "product_suppliers"("supplier_id");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "products_manufacturer_id_idx" ON "products"("manufacturer_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
