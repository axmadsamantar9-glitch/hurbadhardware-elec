// -----------------------------------------------------------------------------
// ARCHIVED (HUB-26 Step 6, 2026-08-29): this script has already been run
// against the live dev DB and its work is done — `products.brand` (the
// legacy free-text column it read from) was dropped in migration
// 20260829140300_drop_product_brand_column, so this file no longer compiles
// against the current schema and is EXCLUDED from `tsconfig.json`'s
// typecheck graph (`prisma/manual-scripts/**`). Kept only as a historical
// record of how the 31 Brand rows / 39 product.brandId values were derived.
// Do not attempt to re-run it — do not remove the tsconfig exclude without
// also fixing or deleting this file.
// -----------------------------------------------------------------------------
//
// HUB-26 Step 2 — backfill Brand rows + Product.brandId/brandNameCache from
// the legacy free-text Product.brand column.
//
// Idempotent: safe to re-run. `db.brand.upsert` on the unique `slug` means
// re-running never creates duplicate brands, and `updateMany` re-applying the
// same brandId/brandNameCache to already-backfilled rows is a no-op.
//
// Manufacturer/Supplier are deliberately left untouched here — no legacy data
// distinguishes "manufacturer" from "brand" today, and no supplier data
// exists to backfill product_suppliers from (confirmed by architect).
//
// Run with: npx tsx prisma/manual-scripts/backfill-brands.ts
// -----------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Mirrors prisma/seed.ts's slugify() exactly — kept as a local copy rather
// than a shared import because this script is a one-off manual migration
// tool, not part of the application's runtime module graph.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const distinctBrands = await db.product.findMany({
    where: { brand: { not: null } },
    distinct: ["brand"],
    select: { brand: true },
  });

  const brandValues = distinctBrands
    .map((row) => row.brand)
    .filter((value): value is string => value !== null && value.trim() !== "");

  console.log(`Found ${brandValues.length} distinct non-empty brand string(s).`);

  let totalProductsUpdated = 0;

  for (const value of brandValues) {
    const slug = slugify(value);

    if (!slug) {
      console.warn(`Skipping brand value "${value}" — slugify produced an empty slug.`);
      continue;
    }

    const brand = await db.brand.upsert({
      where: { slug },
      create: { nameEn: value, nameSo: value, slug },
      update: {},
    });

    const result = await db.product.updateMany({
      where: { brand: value },
      data: { brandId: brand.id, brandNameCache: brand.nameEn },
    });

    totalProductsUpdated += result.count;

    console.log(
      `Brand "${value}" -> slug "${slug}" (id ${brand.id}): ${result.count} product(s) updated.`
    );
  }

  console.log(
    `Done. ${brandValues.length} distinct brand(s) processed, ${totalProductsUpdated} product row(s) updated in total.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
