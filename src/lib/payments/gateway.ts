/**
 * PaymentGateway adapter interface (U12, Iron Rule #7 "Third-Party Providers
 * Isolated Behind Adapters").
 *
 * Every gateway-specific quirk (WaafiPay's embedded-in-body credentials,
 * eDahab's SHA-256 request signing, Paystack's bearer auth) stays inside its
 * own adapter module. Callers outside this directory only ever see this
 * provider-neutral shape -- the raw gateway response rides along in `raw`
 * for logging/debugging but must never be parsed or trusted outside the
 * adapter that produced it.
 *
 * Iron Rule #2 "Payment Success is Server-Authoritative": `queryStatus` is
 * the only authority for a COMPLETED outcome anywhere in this codebase.
 * `initiatePayment` must never return `COMPLETED` synchronously, and
 * webhook/callback bodies are never read for their claimed status (see
 * src/app/api/payments/callback/[gateway]/route.ts).
 */

import type { Decimal } from "@prisma/client/runtime/library";
import type { PaymentGateway as PaymentGatewayEnum, PaymentMethod } from "@prisma/client";

export interface InitiateParams {
  /** Our own idempotency key sent to the gateway -- always `order.id`. */
  gatewayReference: string;
  amountUsd: Decimal;
  chargeAmount: Decimal;
  chargeCurrency: "USD" | "KES";
  method: PaymentMethod;
  orderId: string;
  customerPhone?: string;
  customerEmail?: string;
  returnUrl?: string;
}

export type InitiateResult =
  | {
      ok: true;
      status: "PENDING";
      gatewayTransactionId?: string;
      redirectUrl?: string;
      raw: unknown;
    }
  | {
      ok: false;
      status: "FAILED";
      reason: string;
      raw: unknown;
    };

export type TerminalStatus =
  | { status: "PENDING" }
  | {
      status: "COMPLETED";
      gatewayTransactionId: string;
      settledAmount?: Decimal;
      raw: unknown;
    }
  | { status: "FAILED"; reason: string; raw: unknown };

export interface PaymentGateway {
  readonly gateway: PaymentGatewayEnum;
  readonly chargeCurrency: "USD" | "KES";
  readonly supportedMethods: PaymentMethod[];

  initiatePayment(params: InitiateParams): Promise<InitiateResult>;

  /** Server-side authoritative status query. Never a passthrough of a
   * client- or callback-supplied claim. */
  queryStatus(gatewayReference: string): Promise<TerminalStatus>;

  /** Verifies an inbound webhook/callback's authenticity. Not every gateway
   * supports server-to-server callbacks (eDahab does not) -- absent here
   * means "there is no callback to validate for this gateway", not "skip
   * validation". */
  validateCallback?(rawBody: string, headers: Headers): boolean;
}

export function getGateway(gateway: PaymentGatewayEnum): PaymentGateway {
  // Imported dynamically-in-name-only (require at call time would be a CJS
  // pattern this ESM codebase doesn't use elsewhere) -- these are ordinary
  // static imports declared at the bottom of the file to avoid a hoisting
  // cycle with the adapters, which import only *types* from this module.
  switch (gateway) {
    case "WAAFIPAY":
      return waafiPayGateway;
    case "EDAHAB":
      return edahabGateway;
    case "PAYSTACK":
      return paystackGateway;
    default: {
      const exhaustive: never = gateway;
      throw new Error(`getGateway: unhandled gateway ${String(exhaustive)}`);
    }
  }
}

import { waafiPayGateway } from "./waafipay";
import { edahabGateway } from "./edahab";
import { paystackGateway } from "./paystack";
