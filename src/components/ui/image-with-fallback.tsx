"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

interface ImageWithFallbackProps extends Omit<ImageProps, "onError"> {
  /** Rendered in place of the image if it fails to load at runtime. */
  fallback: React.ReactNode;
}

/**
 * next/image wrapper that swaps to a fallback element on a load error
 * (network failure, a referenced file that doesn't actually exist, etc.),
 * instead of leaving the browser's broken-image icon. Complements the
 * existing "no imageUrl at all" branches in CategoryCard/ProductCard, which
 * only cover the case where there's no URL to try in the first place.
 */
export function ImageWithFallback({ fallback, alt, ...imageProps }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <>{fallback}</>;
  }

  return <Image {...imageProps} alt={alt} onError={() => setFailed(true)} />;
}
