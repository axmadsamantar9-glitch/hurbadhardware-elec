/**
 * Shared bearer-token auth for cron routes (fx-rates, reconcile), U23.
 *
 * Fail-closed: if CRON_SECRET itself is unset in the environment, every
 * request is rejected -- there is no "allow all" fallback, since an unset
 * secret must never be treated as "no auth required".
 */

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);

  const configuredBuf = Buffer.from(configured);
  const providedBuf = Buffer.from(provided);
  if (configuredBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(configuredBuf, providedBuf);
}
