import Image from "next/image";
import Link from "next/link";
import { localeField } from "@/lib/locale-field";
import { sortProductImages } from "@/lib/storefront/images";
import { Card } from "@/components/ui/card";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { CompareButton } from "@/components/storefront/compare-button";
import type { PublicProductListItem } from "@/lib/api/serialize-product";

interface ProductCardProps {
  product: PublicProductListItem;
  locale: string;
  /** Translated "In Stock" / "Out of Stock" / "View Details" strings. */
  labels: { inStock: string; outOfStock: string };
  /**
   * Optional wishlist toggle slot (HUB-35). Omitted by default so existing
   * callers (homepage, category grid) are unaffected; pass labels to opt in
   * to rendering the heart button in the card's top-right corner.
   * `initiallyWishlisted` should be `true` when the caller already knows
   * every card it renders is wishlisted (e.g. /account/wishlist, where that
   * is true by construction) so the button doesn't flash as "unwishlisted"
   * before a click.
   */
  wishlist?: { add: string; remove: string; initiallyWishlisted?: boolean };
  /**
   * Optional compare toggle slot (HUR-26). Same opt-in-slot pattern as
   * `wishlist` above; renders in the card's top-left corner (wishlist owns
   * top-right) so both can be enabled on the same grid.
   */
  compare?: { add: string; remove: string; full: string };
}

/** Product listing card — used on the homepage and category pages (U6/U7). */
export function ProductCard({ product, locale, labels, wishlist, compare }: ProductCardProps) {
  const nameField = localeField(locale, "name");
  const name = product[nameField];
  const primaryImage = sortProductImages(product.images)[0];
  const altField = localeField(locale, "alt");
  const alt = (primaryImage && primaryImage[altField]) || name;

  return (
    <Link href={`/${locale}/products/${product.slug}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative aspect-square w-full bg-muted">
          {primaryImage ? (
            <Image
              src={primaryImage.url}
              alt={alt}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover"
            />
          ) : null}
          {wishlist ? (
            <div className="absolute right-2 top-2">
              <WishlistButton
                productId={product.id}
                labels={wishlist}
                initialWishlisted={wishlist.initiallyWishlisted}
              />
            </div>
          ) : null}
          {compare ? (
            <div className="absolute left-2 top-2">
              <CompareButton productId={product.id} labels={compare} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 p-4">
          {product.brand ? (
            <span className="text-xs font-medium text-muted-foreground">
              {product.brand[localeField(locale, "name")]}
            </span>
          ) : null}
          <span className="line-clamp-2 text-sm font-medium text-foreground">{name}</span>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">
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
          </div>
        </div>
      </Card>
    </Link>
  );
}
