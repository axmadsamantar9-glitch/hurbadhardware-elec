import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getProductsByIds } from "@/lib/api/products";
import { getSpecTemplate } from "@/lib/api/spec-templates";
import { toPublicProduct } from "@/lib/api/serialize-product";
import { buildSpecSheet } from "@/lib/storefront/spec-sheet";
import { parseCompareIdsParam, buildComparisonRows } from "@/lib/storefront/compare";
import { absoluteUrl } from "@/lib/storefront/site-url";
import { CompareTable } from "@/components/storefront/compare-table";
import { locales, defaultLocale, type Locale } from "@/i18n";

interface ComparePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ids?: string }>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

export async function generateMetadata({ params }: ComparePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale });

  return {
    title: t("compare.title"),
    alternates: { canonical: absoluteUrl(`/${locale}/products/compare`) },
    // Comparison sets are ephemeral/user-specific selections, not canonical
    // content — keep this out of search results (no listing value on its
    // own, and the id-bearing query string is not a stable/shareable SEO
    // URL). Per U20 ownership: intentional, not an oversight.
    robots: { index: false, follow: false },
  };
}

/**
 * Side-by-side product comparison page (HUR-26, PRD R5): "Customers compare
 * up to 3 products side-by-side on a shared specification table."
 *
 * Deliberately URL-driven (`?ids=a,b,c`, parsed via `parseCompareIdsParam()`)
 * rather than reading the client-only `useCompareStore` for its own render —
 * this makes the page a plain Server Component with first-paint-correct data
 * (bookmarkable, shareable, no hydration mismatch risk), matching the
 * `query-state.ts` precedent used elsewhere in the storefront. The
 * `CompareButton`/`CompareBar` client components build this URL from the
 * store's current selection (see buildCompareHref()); this page never reads
 * the store directly.
 */
export default async function ComparePage({ params, searchParams }: ComparePageProps) {
  const { locale: rawLocale } = await params;
  const { ids: idsParam } = await searchParams;
  const locale = resolveLocale(rawLocale);
  const t = await getTranslations({ locale });

  const ids = parseCompareIdsParam(idsParam);
  const rawProducts = ids.length > 0 ? await getProductsByIds(ids) : [];

  // getProductsByIds() does not preserve input order; reorder to match the
  // URL's id order so column position stays stable across remove actions.
  const order = new Map(ids.map((id, index) => [id, index]));
  const sortedRawProducts = [...rawProducts].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );

  const publicProducts = sortedRawProducts.map((p) => toPublicProduct(p));

  const templates = await Promise.all(publicProducts.map((p) => getSpecTemplate(p.categoryId)));
  const orderedSpecSheets = publicProducts.map((p, index) =>
    buildSpecSheet(p.specs, templates[index])
  );
  const rows = buildComparisonRows(orderedSpecSheets);

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t("compare.title")}
      </h1>

      {publicProducts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border p-8 text-center">
          <p className="text-muted-foreground">
            {ids.length === 0 ? t("compare.empty") : t("compare.notFound")}
          </p>
          <Link
            href={`/${locale}`}
            className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
          >
            {t("compare.browseProducts")}
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <div className="flex justify-end">
            <Link
              href={`/${locale}/products/compare`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t("compare.clear")}
            </Link>
          </div>
          <CompareTable
            locale={locale}
            products={publicProducts}
            rows={rows}
            labels={{
              inStock: t("product.inStock"),
              outOfStock: t("product.outOfStock"),
              specifications: t("compare.specifications"),
              remove: t("compare.remove"),
              clear: t("compare.clear"),
            }}
          />
        </div>
      )}
    </main>
  );
}
