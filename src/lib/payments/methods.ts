/**
 * Single source of truth for method<->gateway mapping and
 * country<->allowed-methods mapping (U12).
 *
 * Both the checkout UI (advisory only -- purely for hiding inapplicable
 * options) and placeOrder() (authoritative -- Iron Rule #1, never trust
 * client input for a server-decidable fact) call `getAllowedPaymentMethods`
 * so the two can never drift apart.
 */

import type { PaymentGateway, PaymentMethod } from "@prisma/client";

/** Method -> gateway. Every PaymentMethod must appear here exactly once. */
const METHOD_TO_GATEWAY: Record<PaymentMethod, PaymentGateway> = {
  EVC_PLUS: "WAAFIPAY",
  CARD: "WAAFIPAY",
  EDAHAB: "EDAHAB",
  MPESA: "PAYSTACK",
};

export function getGatewayForMethod(method: PaymentMethod): PaymentGateway {
  return METHOD_TO_GATEWAY[method];
}

/** Country (ISO 3166-1 alpha-2) -> allowed payment methods, per PRD's
 * launch-market rail assignment. */
const COUNTRY_TO_METHODS: Record<string, PaymentMethod[]> = {
  SO: ["EVC_PLUS", "EDAHAB", "CARD"],
  KE: ["MPESA", "CARD"],
  ET: ["CARD"],
};

/**
 * Allowed payment methods for a shipping country. Unknown/unlisted countries
 * get no methods (empty array) rather than a guess -- callers must treat an
 * empty result as "checkout cannot proceed for this address" rather than
 * silently falling back to some default rail.
 */
export function getAllowedPaymentMethods(country: string): PaymentMethod[] {
  return COUNTRY_TO_METHODS[country.toUpperCase()] ?? [];
}
