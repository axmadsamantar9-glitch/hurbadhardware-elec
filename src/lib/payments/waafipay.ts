/**
 * WaafiPay adapter (EVC Plus + Card rails), U12.
 *
 * STRUCTURALLY VERIFIED -- LIVE PROVIDER VERIFICATION PENDING CREDENTIALS
 * (no WAAFIPAY_BASE_URL/WAAFIPAY_MERCHANT_UID/WAAFIPAY_API_USER_ID/
 * WAAFIPAY_API_KEY/WAAFIPAY_WEBHOOK_SECRET configured in this environment).
 * The exact request/response field names below follow WaafiPay's publicly
 * documented "asm" gateway shape as closely as available docs allow; any
 * field this codebase cannot confirm without live credentials is isolated to
 * this file so a later correction never leaks into callers.
 *
 * Iron Rule #7: all provider quirks (credentials embedded in the body, not
 * headers; the two-phase pre-authorize/status-query flow) stay inside this
 * file. Iron Rule #2: initiatePayment() NEVER returns COMPLETED -- only
 * queryStatus() is authoritative, and only after reading `params.state`
 * (responseCode 2001 alone means "the gateway accepted the request", not
 * "money moved").
 */

import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import type { PaymentGateway, InitiateParams, InitiateResult, TerminalStatus } from "./gateway";

interface WaafiPayResponse {
  responseCode?: string;
  responseMsg?: string;
  params?: {
    transactionId?: string;
    referenceId?: string;
    /** Real settlement outcome -- responseCode 2001 only means "accepted for
     * processing", never "settled". Unconfirmed exact enum without vendor
     * docs; treated case-insensitively and defensively (unknown values fall
     * back to PENDING, never guessed into COMPLETED). */
    state?: string;
    amount?: string | number;
  };
}

const ACCEPTED_RESPONSE_CODE = "2001";

/** Case-insensitive mapping of WaafiPay's `params.state` to our terminal
 * states. Single small function, not scattered magic strings -- easy to
 * correct once real vendor docs are available. */
function mapState(state: string | undefined): "COMPLETED" | "FAILED" | "PENDING" {
  const normalized = (state ?? "").toUpperCase();
  if (normalized === "APPROVED" || normalized === "SUCCESS" || normalized === "SETTLED") {
    return "COMPLETED";
  }
  if (normalized === "DECLINED" || normalized === "FAILED" || normalized === "REJECTED") {
    return "FAILED";
  }
  return "PENDING";
}

function baseUrl(): string {
  const url = process.env.WAAFIPAY_BASE_URL;
  if (!url) throw new Error("WAAFIPAY_BASE_URL is not configured");
  return url;
}

async function callAsm(serviceName: string, serviceParams: Record<string, unknown>) {
  const res = await fetch(`${baseUrl()}/asm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      schemaVersion: "1.0",
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      channelName: "WEB",
      serviceName,
      // Iron Rule #7: WaafiPay's credentials travel embedded inside the JSON
      // body under serviceParams, not as headers -- a real quirk of this
      // gateway's design, isolated to this one call site.
      serviceParams: {
        merchantUid: process.env.WAAFIPAY_MERCHANT_UID,
        apiUserId: process.env.WAAFIPAY_API_USER_ID,
        apiKey: process.env.WAAFIPAY_API_KEY,
        ...serviceParams,
      },
    }),
  });
  return (await res.json()) as WaafiPayResponse;
}

async function initiatePayment(params: InitiateParams): Promise<InitiateResult> {
  // Truncated (never rounded up) to 2dp before it ever leaves this process --
  // WaafiPay expects a plain decimal amount and we must never send a value
  // larger than what was actually charged.
  const truncatedAmount = params.chargeAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN);

  const raw = await callAsm("API_PREAUTHORIZE", {
    paymentMethod: params.method === "CARD" ? "MWALLET_ACCOUNT" : "MWALLET_ACCOUNT",
    payerInfo: { accountNo: params.customerPhone ?? "" },
    transactionInfo: {
      referenceId: params.gatewayReference,
      invoiceId: params.orderId,
      amount: truncatedAmount.toFixed(2),
      currency: params.chargeCurrency,
      description: `Order ${params.orderId}`,
    },
  });

  // Iron Rule #2: even a responseCode of 2001 here only means "accepted for
  // processing" -- this function must NEVER return status COMPLETED. A
  // non-2001 code is the one case initiatePayment itself can call FAILED
  // (the request was rejected outright, nothing to poll for).
  if (raw.responseCode !== ACCEPTED_RESPONSE_CODE) {
    return { ok: false, status: "FAILED", reason: raw.responseMsg ?? "waafipay_rejected", raw };
  }

  return {
    ok: true,
    status: "PENDING",
    gatewayTransactionId: raw.params?.transactionId,
    raw,
  };
}

async function queryStatus(gatewayReference: string): Promise<TerminalStatus> {
  const raw = await callAsm("API_PURCHASE_STATUS", {
    transactionInfo: { referenceId: gatewayReference },
  });

  if (raw.responseCode !== ACCEPTED_RESPONSE_CODE) {
    return { status: "FAILED", reason: raw.responseMsg ?? "waafipay_query_failed", raw };
  }

  const outcome = mapState(raw.params?.state);
  if (outcome === "COMPLETED") {
    if (!raw.params?.transactionId) {
      // Cannot safely call this COMPLETED without a transaction id to record
      // -- treat as still-pending rather than fabricate one.
      return { status: "PENDING" };
    }
    return {
      status: "COMPLETED",
      gatewayTransactionId: raw.params.transactionId,
      // Settled amount rides in `raw`/settledAmount only -- callers (see
      // webhook handler / reconcile.ts) must never let this overwrite
      // Payment.chargeAmount, which is immutable once the order is placed.
      settledAmount: raw.params.amount !== undefined ? new Decimal(raw.params.amount) : undefined,
      raw,
    };
  }
  if (outcome === "FAILED") {
    return { status: "FAILED", reason: raw.params?.state ?? "waafipay_declined", raw };
  }
  return { status: "PENDING" };
}

function validateCallback(rawBody: string, headers: Headers): boolean {
  const secret = process.env.WAAFIPAY_WEBHOOK_SECRET;
  const signatureHeader = headers.get("x-webhook-signature");
  const timestamp = headers.get("x-webhook-timestamp");
  const eventId = headers.get("x-webhook-event-id");

  if (!secret || !signatureHeader || !timestamp || !eventId) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signatureHeader, "hex");
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false -- guard explicitly so a malformed/truncated header can never
  // throw past this function.
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

export const waafiPayGateway: PaymentGateway = {
  gateway: "WAAFIPAY",
  chargeCurrency: "USD",
  supportedMethods: ["EVC_PLUS", "CARD"],
  initiatePayment,
  queryStatus,
  validateCallback,
};
