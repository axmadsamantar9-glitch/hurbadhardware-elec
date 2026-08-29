/**
 * Manufacturer data layer (HUR-55 AC1).
 *
 * Distinct from Brand (see prisma/schema.prisma doc comment on the
 * Manufacturer model) — no existing product data distinguishes the two
 * concepts today, so this will likely return an empty list until
 * manufacturer data is entered. That is expected, not a bug.
 */

import { db } from "@/lib/db";
import type { Manufacturer } from "@/types/database";

/**
 * List every active manufacturer, ordered alphabetically by English name.
 */
export async function getManufacturers(): Promise<Manufacturer[]> {
  return db.manufacturer.findMany({
    where: { isActive: true },
    orderBy: { nameEn: "asc" },
  });
}
