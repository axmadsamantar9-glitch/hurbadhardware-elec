import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Content-Security-Policy is NOT set here. Next.js's App Router injects its
// own inline <script> tags on every page (the RSC streaming/hydration
// bootstrap) -- a static script-src with no nonce blocks those scripts
// outright, which breaks hydration entirely (React error #412, blank page).
// This isn't specific to any feature this project built; it's required by
// Next.js's own runtime. The fix is a per-request nonce, which can only be
// generated in middleware (src/proxy.ts), not in this static config -- see
// the CSP construction there. Every other security header below has no such
// requirement and stays static here.

// Applied to every response (PRD §9.1). HSTS is inert over plain http, so it's
// safe to always send — browsers only honor it on https origins.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    // Cloudflare Images delivers responsive transforms (KTD8). The custom
    // loader in src/lib/image-loader.ts rewrites next/image URLs to the
    // Cloudflare delivery format.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536],
  },
  // Note: /_next/static already receives `public, max-age=31536000, immutable`
  // from Next.js itself. Setting it manually is redundant and Next warns that
  // it can break dev behavior, so U21's caching work targets Cloudflare edge
  // rules rather than this file.
};

// Wires src/i18n.ts (the getRequestConfig module) into the build so the
// server can resolve it at runtime -- without this plugin wrapper, the
// production build throws "Couldn't find next-intl config file" on every
// [locale] request (500, surfacing as a blank page), even though `next dev`
// resolves the conventional src/i18n.ts path without it.
// This repo's request-config module lives at src/i18n.ts (a single file),
// not the plugin's default convention path (src/i18n/request.ts), so the
// location must be passed explicitly.
const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

export default withNextIntl(nextConfig);
