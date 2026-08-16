import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Cloudflare Images delivers responsive transforms (KTD8). The custom
    // loader in src/lib/image-loader.ts rewrites next/image URLs to the
    // Cloudflare delivery format.
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536],
  },
  // Note: /_next/static already receives `public, max-age=31536000, immutable`
  // from Next.js itself. Setting it manually is redundant and Next warns that
  // it can break dev behavior, so U21's caching work targets Cloudflare edge
  // rules rather than this file.
}

export default nextConfig
