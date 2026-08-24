"use client";

/**
 * Cloudflare Images loader for next/image (KTD8).
 *
 * Product media is uploaded to R2 and delivered through Cloudflare Images,
 * which applies width/quality/format transforms via URL segments rather than
 * query params. Falls back to the raw src when the account hash is unset so
 * local development works without Cloudflare credentials.
 */

interface LoaderParams {
  src: string;
  width: number;
  quality?: number;
}

const ACCOUNT_HASH = process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;

export default function cloudflareImageLoader({ src, width, quality }: LoaderParams): string {
  // Local/relative assets and dev without credentials bypass the CDN.
  if (!ACCOUNT_HASH || src.startsWith("/")) {
    return src;
  }

  const options = [`width=${width}`, `quality=${quality ?? 75}`, "format=auto"];

  return `https://imagedelivery.net/${ACCOUNT_HASH}/${src}/${options.join(",")}`;
}
