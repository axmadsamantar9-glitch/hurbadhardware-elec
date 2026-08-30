/**
 * JSON-LD builders (U20 / U7 / U8). Pure functions — no React, no fetch —
 * so they're covered by plain unit tests and can be reused by both the PDP
 * (`Product`) and category pages (`BreadcrumbList`).
 *
 * Iron Rule #6: these builders only ever receive the already-redacted
 * `PublicProduct*` shape (src/lib/api/serialize-product.ts) — never the raw
 * Prisma row — so stockQuantity can't leak into a page's <script> tag.
 */

import type { PublicProductWithRelations } from "@/lib/api/serialize-product";
import { localeField } from "@/lib/locale-field";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** schema.org BreadcrumbList (U8/U20). */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** schema.org Product, built from the public (redacted) product shape + its canonical URL. */
export function buildProductJsonLd(
  product: PublicProductWithRelations,
  opts: { url: string; locale: string }
) {
  const nameField = localeField(opts.locale, "name");
  const descriptionField = localeField(opts.locale, "description");

  const images = [...product.images]
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.position - b.position;
    })
    .map((image) => image.url);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product[nameField],
    description: product[descriptionField] ?? undefined,
    sku: product.sku,
    image: images.length > 0 ? images : undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand[nameField] } : undefined,
    offers: {
      "@type": "Offer",
      url: opts.url,
      priceCurrency: "USD",
      price: product.basePriceUsd.toString(),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };
}
