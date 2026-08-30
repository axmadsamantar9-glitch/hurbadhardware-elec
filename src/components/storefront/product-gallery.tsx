"use client";

/**
 * PDP image gallery (U7): a large primary image plus a thumbnail strip.
 * Built on next/image with the existing Cloudflare Images custom loader
 * (src/lib/image-loader.ts, wired globally via next.config.ts) — no new
 * loader/config needed here.
 */

import Image from "next/image";
import { useState } from "react";
import { localeField } from "@/lib/locale-field";
import { sortProductImages } from "@/lib/storefront/images";
import type { ProductImage } from "@/types/database";

interface ProductGalleryProps {
  images: ProductImage[];
  /** Fallback alt text (product name) when an image has no altEn/altSo. */
  fallbackAlt: string;
  locale: string;
}

export function ProductGallery({ images, fallbackAlt, locale }: ProductGalleryProps) {
  const ordered = sortProductImages(images);
  const [activeIndex, setActiveIndex] = useState(0);
  const altField = localeField(locale, "alt");

  if (ordered.length === 0) {
    return <div className="aspect-square w-full rounded-lg bg-muted" aria-hidden="true" />;
  }

  const active = ordered[Math.min(activeIndex, ordered.length - 1)];
  const activeAlt = active[altField] || fallbackAlt;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
        <Image
          src={active.url}
          alt={activeAlt}
          fill
          priority
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover"
        />
      </div>
      {ordered.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={fallbackAlt}>
          {ordered.map((image, index) => {
            const isActive = index === activeIndex;
            const alt = image[altField] || fallbackAlt;
            return (
              <button
                key={image.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={alt}
                onClick={() => setActiveIndex(index)}
                className={
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
                  (isActive ? "border-primary" : "border-transparent")
                }
              >
                <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
