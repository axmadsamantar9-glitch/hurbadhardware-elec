-- HUB-27: per-category specification templates. Purely additive — no
-- existing table is altered and no data is migrated (zero ProductSpec rows
-- exist at the time of this migration, confirmed by product-planning's
-- investigation), so this migration is a single step with no destructive
-- operations and needs no second human checkpoint (contrast with HUB-26's
-- drop-column step).

-- CreateTable
CREATE TABLE "spec_template_keys" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "key_slug" TEXT NOT NULL,
    "key_en" TEXT NOT NULL,
    "key_so" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "spec_template_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spec_template_keys_category_id_key_slug_key" ON "spec_template_keys"("category_id", "key_slug");

-- CreateIndex
CREATE INDEX "spec_template_keys_category_id_idx" ON "spec_template_keys"("category_id");

-- AddForeignKey
ALTER TABLE "spec_template_keys" ADD CONSTRAINT "spec_template_keys_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
