/**
 * Tax calculation (HUR-191, U11 / PRD §0.6, §2, §53.5, §54).
 *
 * Isolated extension point ONLY. product-planning confirmed (Pre-Build
 * Readiness Gate, PRD §0.6) that tax treatment/rate is an unconfirmed
 * business decision -- no jurisdiction, no rate, no exemption rules have
 * been decided. This function returns `0` unconditionally on purpose.
 *
 * DO NOT hardcode any nonzero rate here (e.g. a guessed VAT %) until a real
 * business decision lands and this ticket (or a follow-up) is explicitly
 * re-scoped to implement it. Every caller (checkout order-total calc) must
 * keep treating this as "tax may become nonzero later" rather than
 * assuming $0 forever.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars -- `subtotalUsd` is part of the required signature (this ticket's spec) even though the current implementation always returns 0; a future rate implementation will consume it. */
export function calculateTax(subtotalUsd: number): number {
  return 0;
}
