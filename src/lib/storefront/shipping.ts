/**
 * Shipping cost calculation (HUB-41 / PRD Sec 0.6, Sec 2, Sec 53.5, Sec 54).
 *
 * Isolated extension point ONLY. Shipping zones, per-carrier rates, and
 * free-shipping thresholds are unconfirmed business decisions (blocked,
 * same status as tax treatment in src/lib/storefront/tax.ts) -- no zone
 * map, no rate table, no threshold has been decided. This function returns
 * `0` unconditionally on purpose.
 *
 * DO NOT hardcode any nonzero rate here until a real business decision
 * lands and this ticket (or a follow-up) is explicitly re-scoped.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- `subtotalUsd` is part of the required signature (this ticket's spec) even though the current implementation always returns 0; a future rate implementation will consume it. */
export function calculateShipping(subtotalUsd: number): number {
  return 0;
}
