import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProductBySlug } from "@/lib/api/products";
import { getSpecTemplate } from "@/lib/api/spec-templates";
import { getCompatibilityForProduct } from "@/lib/api/compatibility";
import { isProductWishlisted } from "@/lib/api/wishlist";
import { toPublicProduct } from "@/lib/api/serialize-product";
import { buildProductJsonLd, toSafeJsonLdString } from "@/lib/storefront/jsonld";
import { absoluteUrl } from "@/lib/storefront/site-url";
import { localeField } from "@/lib/locale-field";
import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/storefront/breadcrumbs";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { VariantSelector } from "@/components/storefront/variant-selector";
import { SpecSheet } from "@/components/storefront/spec-sheet";
import { CompatibilityWarnings } from "@/components/storefront/compatibility-warnings";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { locales, defaultLocale, type Locale } from "@/i18n";

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const product = await getProductBySlug(slug, locale);

  if (!product) {
    return { title: "Product not found" };
  }

  const nameField = localeField(locale, "name");
  const descriptionField = localeField(locale, "description");
  const name = product[nameField];
  const description = product[descriptionField] ?? undefined;
  const url = absoluteUrl(`/${locale}/products/${slug}`);
  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];

  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: name,
      description,
      url,
      type: "website",
      images: primaryImage ? [{ url: primaryImage.url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);

  const product = await getProductBySlug(slug, locale);
  if (!product) {
    notFound();
  }

  const t = await getTranslations({ locale });
  const nameField = localeField(locale, "name");
  const descriptionField = localeField(locale, "description");

  const session = await auth();
  const userId = session?.user?.id;

  const [template, compatibility, initialWishlisted] = await Promise.all([
    getSpecTemplate(product.categoryId),
    getCompatibilityForProduct(product.id),
    userId ? isProductWishlisted(userId, product.id) : Promise.resolve(false),
  ]);

  const publicProduct = toPublicProduct(product);
  const name = publicProduct[nameField];
  const description = publicProduct[descriptionField];
  const url = absoluteUrl(`/${locale}/products/${slug}`);
  const jsonLd = buildProductJsonLd(publicProduct, { url, locale });
  const compatibilityWarningField =
    locale === "so" ? "compatibilityWarningSo" : "compatibilityWarningEn";

  const breadcrumbItems = [
    { name: t("nav.home"), url: absoluteUrl(`/${locale}`) },
    {
      name: publicProduct.category[nameField],
      url: absoluteUrl(`/${locale}/category/${publicProduct.category.slug}`),
    },
    { name, url },
  ];

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProductGallery images={publicProduct.images} fallbackAlt={name} locale={locale} />

        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                {publicProduct.brand ? (
                  <p className="text-sm font-medium text-muted-foreground">
                    {publicProduct.brand[nameField]}
                  </p>
                ) : null}
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {name}
                </h1>
              </div>
              <WishlistButton
                productId={publicProduct.id}
                labels={{
                  add: t("product.addToWishlist"),
                  remove: t("product.removeFromWishlist"),
                }}
                initialWishlisted={initialWishlisted}
              />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              ${publicProduct.basePriceUsd.toString()}
            </p>
            <p
              className={
                publicProduct.inStock
                  ? "mt-1 text-sm font-medium text-success"
                  : "mt-1 text-sm font-medium text-error"
              }
            >
              {publicProduct.inStock ? t("product.inStock") : t("product.outOfStock")}
            </p>
          </div>

          {description ? <p className="text-muted-foreground">{description}</p> : null}

          {publicProduct.variants.length > 0 ? (
            <VariantSelector variants={publicProduct.variants} />
          ) : null}

          <CompatibilityWarnings
            attributes={compatibility}
            productWarning={publicProduct[compatibilityWarningField]}
            locale={locale}
            title={t("product.compatibility")}
          />
        </div>
      </div>

      <div className="mt-12">
        <SpecSheet
          specs={publicProduct.specs}
          template={template}
          locale={locale}
          title={t("product.specifications")}
        />
      </div>

      {/* JSON-LD requires raw <script> content; input is server-built from the redacted public product shape, never user HTML. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLdString(jsonLd) }}
      />
    </main>
  );
}
