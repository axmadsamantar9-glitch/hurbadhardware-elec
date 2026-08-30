/**
 * Absolute site URL helper (U20) — canonical URLs and JSON-LD `url`/`item`
 * fields must be fully-qualified, not relative. Mirrors the
 * `NEXT_PUBLIC_SITE_URL` convention already documented in `.env.example`;
 * falls back to localhost so pages render in dev without the var set.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
