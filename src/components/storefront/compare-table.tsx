import Image from "next/image";
import Link from "next/link";
import { localeField } from "@/lib/locale-field";
import { sortProductImages } from "@/lib/storefront/images";
import { buildCompareHref, type ComparisonRow } from "@/lib/storefront/compare";
import type { PublicProductWithRelations } from "@/lib/api/serialize-product";

interface CompareTableProps {
  locale: string;
  products: PublicProductWithRelations[];
  rows: ComparisonRow[];
  labels: {
    inStock: string;
    outOfStock: string;
    specifications: string;
    remove: string;
    clear: string;
  };
}

/**
 * Side-by-side comparison table (HUR-26, PRD R5): selected products as
 * columns, a shared row per spec key (from `buildComparisonRows()`), aligned
 * across products even when only some carry a given spec.
 *
 * Server Component: all data (products, rows) is passed in already-fetched
 * and already-redacted (Iron Rule #6 — via `toPublicProduct()` upstream in
 * the page). "Remove"/"Clear" are plain `<Link>`s to a new `?ids=` URL
 * (mirroring `Pagination`'s `buildHref` pattern) rather than client-side
 * state, so no hydration/client-store synchronization is needed for this
 * table's own render — the URL is the single source of truth for what's
 * displayed here.
 */
export function CompareTable({ locale, products, rows, labels }: CompareTableProps) {
  const nameField = localeField(locale, "name");
  const keyField = localeField(locale, "key");
  const valuesField = keyField === "keyEn" ? "valuesEn" : "valuesSo";
  const allIds = products.map((p) => p.id);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-40 border-b border-border p-2 text-left align-bottom text-muted-foreground">
              {labels.specifications}
            </th>
            {products.map((product) => {
              const image = sortProductImages(product.images)[0];
              const remainingIds = allIds.filter((id) => id !== product.id);
              return (
                <th
                  key={product.id}
                  className="min-w-[180px] border-b border-border p-2 align-bottom text-left"
                >
                  <div className="flex flex-col gap-2">
                    <div className="relative aspect-square w-full bg-muted">
                      {image ? (
                        <Image
                          src={image.url}
                          alt={product[nameField]}
                          fill
                          sizes="200px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <Link
                      href={`/${locale}/products/${product.slug}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {product[nameField]}
                    </Link>
                    <span className="font-semibold text-foreground">
                      ${product.basePriceUsd.toString()}
                    </span>
                    <span
                      className={
                        product.inStock
                          ? "text-xs font-medium text-success"
                          : "text-xs font-medium text-error"
                      }
                    >
                      {product.inStock ? labels.inStock : labels.outOfStock}
                    </span>
                    <Link
                      href={buildCompareHref(locale, remainingIds)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {labels.remove}
                    </Link>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.keyEn.toLowerCase()} className="odd:bg-muted/40">
              <th scope="row" className="p-2 text-left font-normal text-muted-foreground">
                {row[keyField]}
              </th>
              {row[valuesField].map((value, index) => (
                <td key={products[index]?.id ?? index} className="p-2 text-foreground">
                  {value ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
