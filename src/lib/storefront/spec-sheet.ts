/**
 * Pure helper that orders a product's specs (ProductSpec[]) for PDP display
 * using the category's SpecTemplateKey ordering as a hint (U7).
 *
 * ProductSpec is deliberately NOT foreign-keyed to SpecTemplateKey (see that
 * model's doc comment in prisma/schema.prisma) — a product's specs are free
 * text and may not line up with the template at all. So this is a
 * best-effort re-order, not a strict join: specs whose `keyEn` matches a
 * template key (case-insensitively) are shown first, in template order;
 * anything left over keeps the product's own `sortOrder`, appended after.
 */

import type { ProductSpec, SpecTemplateKey } from "@/types/database";

export type SpecSheetRow = Pick<ProductSpec, "keyEn" | "keySo" | "valueEn" | "valueSo">;

export function buildSpecSheet<T extends SpecSheetRow>(
  specs: T[],
  template: Pick<SpecTemplateKey, "keyEn">[]
): T[] {
  const templateOrder = new Map(template.map((key, index) => [key.keyEn.toLowerCase(), index]));

  const matched: T[] = [];
  const unmatched: T[] = [];
  for (const spec of specs) {
    if (templateOrder.has(spec.keyEn.toLowerCase())) {
      matched.push(spec);
    } else {
      unmatched.push(spec);
    }
  }

  matched.sort(
    (a, b) => templateOrder.get(a.keyEn.toLowerCase())! - templateOrder.get(b.keyEn.toLowerCase())!
  );

  return [...matched, ...unmatched];
}
