import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "@/i18n";
import { validateCallbackUrl } from "@/lib/validate-callback-url";
import type { NextRequest } from "next/server";

// Every request gets a correlation ID: reuse one an upstream proxy (e.g.
// Cloudflare) already set, otherwise mint one here. It's attached to both the
// outgoing request (so Server Components/Route Handlers can read it via
// next/headers, see src/lib/request-context.ts) and the response (so it's
// visible to the client for support/debugging) — PRD §9.6.
//
// Auth middleware (U3) protects /account and /admin routes.
// i18n middleware (U4) handles locale routing and detection.
const CORRELATION_HEADER = "x-request-id";
// Only trust an inbound value shaped like a UUID; anything else (arbitrary
// length/content a client could send) gets replaced with a freshly minted
// one, so unvalidated client input never flows into logs, responses, or the
// audit_logs.correlation_id column.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy, generated per-request with a fresh nonce.
 *
 * This must live in middleware, not next.config.ts: Next.js's App Router
 * injects its own inline <script> tags on every page (the RSC streaming/
 * hydration bootstrap), and it automatically reads a nonce out of the
 * Content-Security-Policy response header text (looking for `'nonce-...'`
 * in the string) to apply to those scripts. A static header from
 * next.config.ts can't carry a fresh value per request, so without this,
 * script-src 'self' blocks Next's own required scripts outright -- breaking
 * hydration entirely (React error #412, a blank page) on every single page,
 * independent of anything this project built. `style-src 'unsafe-inline'`
 * is unrelated and unchanged -- Tailwind's inline style attributes need it
 * and CSS injection carries a different risk profile than script execution.
 */
function buildCsp(nonce: string): string {
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://imagedelivery.net;
    font-src 'self';
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Create the next-intl middleware
const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always", // Always require locale prefix
});

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip i18n middleware for API routes — they don't need locale routing
  const isApiRoute = pathname.startsWith("/api/");
  let locale: string | undefined;

  if (!isApiRoute) {
    // Apply next-intl middleware only to non-API routes (handles locale routing)
    const intlResponse = intlMiddleware(request);

    // If next-intl handled a redirect (e.g., invalid locale), use that response
    if (intlResponse?.status !== 200) {
      return intlResponse;
    }

    // Extract locale from pathname for auth checks
    const localePattern = new RegExp(`^/(${locales.join("|")})(/|$)`);
    const match = pathname.match(localePattern);
    locale = match?.[1] as string | undefined;
  }

  // Public routes that don't require authentication
  const publicRoutes = [
    "/api/auth",
    "/api/health",
    "/api/products",
    "/auth/signin",
    "/auth/register",
    "/",
    "/products",
  ];

  // Check if the path is public (accounting for locale prefix)
  const isPublic = publicRoutes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(route + "/") ||
      pathname === `/${locale}${route}` ||
      pathname.startsWith(`/${locale}${route}/`)
  );

  // Protected routes: require authentication
  if ((pathname.includes("/account") || pathname.includes("/admin")) && !isPublic) {
    const session = await auth();

    if (!session) {
      const url = new URL(`/${locale || defaultLocale}/auth/signin`, request.url);
      // Validate callbackUrl to prevent open redirects
      url.searchParams.set("callbackUrl", validateCallbackUrl(pathname));
      return NextResponse.redirect(url);
    }

    // Admin routes: check role
    if (pathname.includes("/admin") && session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL(`/${locale || defaultLocale}`, request.url));
    }
  }

  // Continue with correlation ID setup
  const inbound = request.headers.get(CORRELATION_HEADER);
  const correlationId = inbound && UUID_PATTERN.test(inbound) ? inbound : randomUUID();

  // Base64-encoded random value, per Next.js's own documented CSP-nonce
  // pattern -- a fresh nonce every request, never reused, never derived from
  // anything client-controlled.
  const nonce = Buffer.from(randomUUID()).toString("base64");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(CORRELATION_HEADER, correlationId);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));

  return response;
}

export const config = {
  matcher: [
    // Match all routes except:
    // - /_next (Next.js internals)
    // - /api (API routes don't need locale prefix, but they're matched for correlation ID)
    // - /_next/static and /_next/image (static assets)
    // - /favicon.ico (favicon)
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
