import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCategories } from "@/lib/api/categories";
import { getProducts } from "@/lib/api/products";
import { toPublicProducts } from "@/lib/api/serialize-product";
import { CategoryCard } from "@/components/storefront/category-card";
import { ProductCard } from "@/components/storefront/product-card";
import { locales, defaultLocale, type Locale } from "@/i18n";

export const metadata: Metadata = {
  title: "HurbadHardware — Electronics for East Africa",
  description:
    "Shop smartphones, laptops, tablets, networking equipment, CCTV systems, printers, and computer components across East Africa.",
};

/** Number of "featured" products shown on the homepage (newest-first — see AGENTS.md note on isFeatured). */
const FEATURED_PRODUCT_COUNT = 8;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;

  const t = await getTranslations({ locale });

  const [categories, productsResult] = await Promise.all([
    getCategories(),
    getProducts({
      page: 1,
      limit: FEATURED_PRODUCT_COUNT,
      search: "",
      category: "",
      brand: "",
      sort: "newest",
    }),
  ]);

  const featuredProducts = toPublicProducts(productsResult.products);

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

      {featuredProducts.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-foreground">
            {t("storefront.featuredProducts")}
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                locale={locale}
                labels={{ inStock: t("product.inStock"), outOfStock: t("product.outOfStock") }}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
