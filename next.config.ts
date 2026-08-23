import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

// Static CSP (no nonces): keeps pages statically optimizable/ISR-eligible,
// matching §4.1's "server-rendered/streamed where SEO/performance benefit"
// approach. Nothing dynamic or third-party-scripted exists yet — revisit with
// a nonce-based policy only if a future feature needs inline/third-party
// scripts a static allowlist can't express safely.
// `upgrade-insecure-requests` is dev-only-omitted: over plain http://localhost
// it would force the browser to upgrade every asset request to https, which
// doesn't exist locally, and break dev entirely.
const cspHeader = `
  default-src 'self';
  script-src 'self'${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://imagedelivery.net;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isDev ? '' : 'upgrade-insecure-requests;'}
`
  .replace(/\s{2,}/g, ' ')
  .trim()

// Applied to every response (PRD §9.1). HSTS is inert over plain http, so it's
// safe to always send — browsers only honor it on https origins.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspHeader },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
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
