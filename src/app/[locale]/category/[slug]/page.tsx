import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCategories } from "@/lib/api/categories";
import { getProducts, DEFAULT_PAGE_SIZE } from "@/lib/api/products";
import { toPublicProducts } from "@/lib/api/serialize-product";
import { findCategoryBySlug } from "@/lib/storefront/category-tree";
import { absoluteUrl } from "@/lib/storefront/site-url";
import { localeField } from "@/lib/locale-field";
import { Breadcrumbs } from "@/components/storefront/breadcrumbs";
import { ProductCard } from "@/components/storefront/product-card";
import { Pagination } from "@/components/storefront/pagination";
import { locales, defaultLocale, type Locale } from "@/i18n";

interface CategoryPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
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
  const { page: pageParam } = await searchParams;
  const locale = resolveLocale(rawLocale);
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const t = await getTranslations({ locale });
  const nameField = localeField(locale, "name");

  const categories = await getCategories();
  const category = findCategoryBySlug(categories, slug);

  if (!category) {
    notFound();
  }

  const productsResult = await getProducts({
    page,
    limit: DEFAULT_PAGE_SIZE,
    search: "",
    category: slug,
    brand: "",
    sort: "newest",
  });
  const products = toPublicProducts(productsResult.products);

  const breadcrumbItems = [
    { name: t("nav.home"), url: absoluteUrl(`/${locale}`) },
    { name: category[nameField], url: absoluteUrl(`/${locale}/category/${slug}`) },
  ];

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={breadcrumbItems} />
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
        {category[nameField]}
      </h1>

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
              />
            ))}
          </div>
          <Pagination
            page={page}
            hasMore={productsResult.hasMore}
            buildHref={(p) => `/${locale}/category/${slug}?page=${p}`}
            labels={{ previous: t("storefront.previous"), next: t("storefront.next") }}
          />
        </>
      )}
    </main>
  );
}
