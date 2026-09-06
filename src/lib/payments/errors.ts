/**
 * Typed structural errors for the payment integration layer (U12/U23).
 *
 * These are thrown BEFORE any network call whenever a request can be proven
 * invalid from data already in hand (e.g. a non-integer KES amount, a stale
 * FX rate) -- Iron Rule: fail closed, never let a malformed/unsafe request
 * reach a third-party gateway.
 */

/** Thrown by an adapter when an amount fails a gateway-specific structural
 * constraint (e.g. Paystack requires an integer KES amount) BEFORE any HTTP
 * call is made. */
export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/** Thrown by src/lib/currency/rates.ts's getRate() when no FxRate row exists
 * yet, or the newest one is older than FX_STALE_HOURS. Callers (checkout)
 * must treat this as "cannot safely price this order right now" and roll
 * back rather than guess. */
export class StaleRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleRateError";
  }
}

/** Thrown when a gateway adapter receives a malformed/unexpected response
 * shape it cannot safely interpret (structural defense -- never guess). */
export class GatewayResponseError extends Error {
  constructor(
    public readonly gateway: string,
    message: string
  ) {
    super(message);
    this.name = "GatewayResponseError";
  }
}
