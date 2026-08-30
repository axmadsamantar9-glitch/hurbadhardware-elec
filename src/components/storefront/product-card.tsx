import Image from "next/image";
import Link from "next/link";
import { localeField } from "@/lib/locale-field";
import { sortProductImages } from "@/lib/storefront/images";
import { Card } from "@/components/ui/card";
import type { PublicProductListItem } from "@/lib/api/serialize-product";

interface ProductCardProps {
  product: PublicProductListItem;
  locale: string;
  /** Translated "In Stock" / "Out of Stock" / "View Details" strings. */
  labels: { inStock: string; outOfStock: string };
}

/** Product listing card — used on the homepage and category pages (U6/U7). */
export function ProductCard({ product, locale, labels }: ProductCardProps) {
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
