"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import { useWishlistStore } from "@/store/wishlistStore";
import type { PublicProductListItem } from "@/lib/api/serialize-product";

export const dynamic = "force-dynamic";

/**
 * Authenticated wishlist view page (HUB-35, U9 / PRD R9).
 *
 * Follows the same auth-gate pattern as src/app/[locale]/account/page.tsx:
 * client component, `useSession()`, redirect to sign-in (preserving locale)
 * when unauthenticated. Products fetched from GET /api/wishlist are already
 * public-shaped (Iron Rule #6 redaction happens server-side in the route).
 */
export default function WishlistPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const locale = pathname.split("/")[1] || "en";

  const [products, setProducts] = useState<PublicProductListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const setAll = useWishlistStore((s) => s.setAll);
  const productIds = useWishlistStore((s) => s.productIds);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/auth/signin`);
    }
  }, [status, router, locale]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    fetch("/api/wishlist")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ products: PublicProductListItem[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setAll(data.products.map((p) => p.id));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, setAll]);

  // Keep the displayed list in sync when a card's heart button removes an
  // item (optimistic store update) without requiring a full refetch.
  const visibleProducts = products.filter((p) => productIds.has(p.id));

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="mx-auto max-w-7xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{t("wishlist.title")}</h1>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-zinc-600">{t("common.loading")}</p>
          ) : loadError ? (
            <p className="text-zinc-600">{t("common.error")}</p>
          ) : visibleProducts.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
              <p className="text-zinc-600">{t("wishlist.empty")}</p>
              <a
                href={`/${locale}`}
                className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t("wishlist.browseProducts")}
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  labels={{
                    inStock: t("product.inStock"),
                    outOfStock: t("product.outOfStock"),
                  }}
                  wishlist={{
                    add: t("product.addToWishlist"),
                    remove: t("product.removeFromWishlist"),
                    initiallyWishlisted: true,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
