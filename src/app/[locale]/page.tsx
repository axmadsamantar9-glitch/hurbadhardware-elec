import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCategories } from "@/lib/api/categories";
import { getBrands } from "@/lib/api/brands";
import { getProducts, DEFAULT_PAGE_SIZE } from "@/lib/api/products";
import { toPublicProducts } from "@/lib/api/serialize-product";
import {
  parseStorefrontSearchParams,
  toGetProductsQuery,
  hasActiveFilters,
  buildFilterHref,
} from "@/lib/storefront/query-state";
import { localeField } from "@/lib/locale-field";
import { CategoryCard } from "@/components/storefront/category-card";
import { ProductCard } from "@/components/storefront/product-card";
import { SearchBar } from "@/components/storefront/search-bar";
import { SortDropdown } from "@/components/storefront/sort-dropdown";
import { FilterSidebar } from "@/components/storefront/filter-sidebar";
import { Pagination } from "@/components/storefront/pagination";
import { CompareBar } from "@/components/storefront/compare-bar";
import { locales, defaultLocale, type Locale } from "@/i18n";

export const metadata: Metadata = {
  title: "HurbadHardware — Electronics for East Africa",
  description:
    "Shop smartphones, laptops, tablets, networking equipment, CCTV systems, printers, and computer components across East Africa.",
};

interface HomePageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ params, searchParams }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
  const rawSearchParams = await searchParams;

  const t = await getTranslations({ locale });
  const nameField = localeField(locale, "name");

  const filterState = parseStorefrontSearchParams(rawSearchParams);
  const productsQuery = toGetProductsQuery(filterState, { limit: DEFAULT_PAGE_SIZE });

  const [categories, brands, productsResult] = await Promise.all([
    getCategories(),
    getBrands(),
    getProducts(productsQuery),
  ]);

  const products = toPublicProducts(productsResult.products);
  const filtersActive = hasActiveFilters(filterState);

  const categoryOptions = categories.map((category) => ({
    slug: category.slug,
    name: category[nameField],
  }));
  const brandOptions = brands.map((brand) => ({ slug: brand.slug, name: brand[nameField] }));

  return (
    <main className="flex-1">
      <section className="border-b border-border bg-muted px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 text-center">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("home.welcome")}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{t("home.description")}</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-foreground">{t("storefront.shopByCategory")}</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} locale={locale} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-foreground">
          {filtersActive ? t("storefront.searchResults") : t("storefront.browseProducts")}
        </h2>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <FilterSidebar
              categories={categoryOptions}
              brands={brandOptions}
              showCategoryFilter={true}
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
          <p className="mt-8 text-muted-foreground">{t("storefront.noResults")}</p>
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
              buildHref={(p) => buildFilterHref(`/${locale}`, filterState, { page: p })}
              labels={{ previous: t("storefront.previous"), next: t("storefront.next") }}
            />
          </>
        )}
        <CompareBar
          locale={locale}
          viewLabel={t("compare.viewCompare")}
          clearLabel={t("compare.clear")}
        />
      </section>
    </main>
  );
}
