import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCategories } from "@/lib/api/categories";
import { getBrands } from "@/lib/api/brands";
import { getProducts, DEFAULT_PAGE_SIZE } from "@/lib/api/products";
import { toPublicProducts } from "@/lib/api/serialize-product";
import { findCategoryBySlug } from "@/lib/storefront/category-tree";
import { absoluteUrl } from "@/lib/storefront/site-url";
import {
  parseStorefrontSearchParams,
  toGetProductsQuery,
  buildFilterHref,
} from "@/lib/storefront/query-state";
import { localeField } from "@/lib/locale-field";
import { Breadcrumbs } from "@/components/storefront/breadcrumbs";
import { ProductCard } from "@/components/storefront/product-card";
import { Pagination } from "@/components/storefront/pagination";
import { SearchBar } from "@/components/storefront/search-bar";
import { SortDropdown } from "@/components/storefront/sort-dropdown";
import { FilterSidebar } from "@/components/storefront/filter-sidebar";
import { CompareBar } from "@/components/storefront/compare-bar";
import { locales, defaultLocale, type Locale } from "@/i18n";

interface CategoryPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const categories = await getCategories();
  const category = findCategoryBySlug(categories, slug);

  if (!category) {
    return { title: "Category not found" };
  }

  const name = category[localeField(locale, "name")];
  return {
    title: name,
    description: `Shop ${name} at HurbadHardware.`,
    alternates: { canonical: absoluteUrl(`/${locale}/category/${slug}`) },
    openGraph: { title: name, type: "website" },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { locale: rawLocale, slug } = await params;
  const rawSearchParams = await searchParams;
  const locale = resolveLocale(rawLocale);

  const t = await getTranslations({ locale });
  const nameField = localeField(locale, "name");

  const categories = await getCategories();
  const category = findCategoryBySlug(categories, slug);

  if (!category) {
    notFound();
  }

  const filterState = parseStorefrontSearchParams(rawSearchParams);
  const productsQuery = toGetProductsQuery(filterState, {
    limit: DEFAULT_PAGE_SIZE,
    categoryOverride: slug,
  });

  const [brands, productsResult] = await Promise.all([getBrands(), getProducts(productsQuery)]);
  const products = toPublicProducts(productsResult.products);
  const brandOptions = brands.map((brand) => ({ slug: brand.slug, name: brand[nameField] }));

  const breadcrumbItems = [
    { name: t("nav.home"), url: absoluteUrl(`/${locale}`) },
    { name: category[nameField], url: absoluteUrl(`/${locale}/category/${slug}`) },
  ];

  const basePath = `/${locale}/category/${slug}`;

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={breadcrumbItems} />
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
        {category[nameField]}
      </h1>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <FilterSidebar
            categories={[]}
            brands={brandOptions}
            showCategoryFilter={false}
            labels={{
              filters: t("storefront.filters.title"),
              category: t("storefront.filters.category"),
              brand: t("storefront.filters.brand"),
              allCategories: t("storefront.filters.allCategories"),
              allBrands: t("storefront.filters.allBrands"),
              priceRange: t("storefront.filters.priceRange"),
              priceMin: t("storefront.filters.priceMin"),
              priceMax: t("storefront.filters.priceMax"),
              inStock: t("storefront.filters.inStock"),
              clearFilters: t("storefront.filters.clear"),
              close: t("storefront.filters.close"),
            }}
          />
          <SearchBar label={t("storefront.search.placeholder")} />
        </div>
        <SortDropdown
          label={t("storefront.sort.label")}
          optionLabels={{
            newest: t("storefront.sort.newest"),
            priceAsc: t("storefront.sort.priceAsc"),
            priceDesc: t("storefront.sort.priceDesc"),
            rating: t("storefront.sort.rating"),
            popularity: t("storefront.sort.popularity"),
          }}
        />
      </div>

      {products.length === 0 ? (
        <p className="mt-8 text-muted-foreground">{t("storefront.noProducts")}</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                locale={locale}
                labels={{ inStock: t("product.inStock"), outOfStock: t("product.outOfStock") }}
                compare={{
                  add: t("product.addToCompare"),
                  remove: t("product.removeFromCompare"),
                  full: t("product.compareFull"),
                }}
              />
            ))}
          </div>
          <Pagination
            page={filterState.page}
            hasMore={productsResult.hasMore}
            buildHref={(p) => buildFilterHref(basePath, filterState, { page: p })}
            labels={{ previous: t("storefront.previous"), next: t("storefront.next") }}
          />
        </>
      )}
      <CompareBar
        locale={locale}
        viewLabel={t("compare.viewCompare")}
        clearLabel={t("compare.clear")}
      />
    </main>
  );
}
