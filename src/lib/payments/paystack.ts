/**
 * Paystack adapter (M-Pesa/mobile_money rail for Kenya), U12.
 *
 * STRUCTURALLY VERIFIED -- LIVE PROVIDER VERIFICATION PENDING CREDENTIALS
 * (no PAYSTACK_SECRET_KEY/PAYSTACK_PUBLIC_KEY configured in this
 * environment).
 *
 * Iron Rule #7: bearer auth and Paystack's integer-kobo-style amount
 * requirement stay isolated here. Paystack's `amount` field for KES must be
 * a whole integer (no sub-unit fraction) -- rejected structurally via
 * InvalidAmountError BEFORE any HTTP call, never sent to the API to fail
 * there.
 */

import { timingSafeEqual, createHmac } from "node:crypto";
import type { Decimal } from "@prisma/client/runtime/library";
import type { PaymentGateway, InitiateParams, InitiateResult, TerminalStatus } from "./gateway";
import { InvalidAmountError } from "./errors";

interface PaystackInitializeResponse {
  status: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message?: string;
  data?: {
    status?: string; // "success" | "failed" | "abandoned" | "pending" ...
    reference?: string;
    id?: number;
    amount?: number;
  };
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

function baseUrl(): string {
  return process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey()}`,
    "Content-Type": "application/json",
  };
}

/** Throws InvalidAmountError if `amount` is not a whole integer -- Paystack
 * KES amounts must be integers with no fractional component. Checked here,
 * before any HTTP call is constructed. */
function assertIntegerAmount(amount: Decimal): void {
  if (!amount.isInteger()) {
    throw new InvalidAmountError(
      `Paystack requires an integer KES amount, got ${amount.toString()}`
    );
  }
}

async function initiatePayment(params: InitiateParams): Promise<InitiateResult> {
  assertIntegerAmount(params.chargeAmount);

  const res = await fetch(`${baseUrl()}/transaction/initialize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: params.customerEmail ?? "guest@hurbadhardware.com",
      amount: params.chargeAmount.toNumber(),
      currency: params.chargeCurrency,
      reference: params.gatewayReference,
      channels: ["mobile_money"],
      callback_url: params.returnUrl,
    }),
  });
  const raw = (await res.json()) as PaystackInitializeResponse;

  if (!raw.status) {
    return { ok: false, status: "FAILED", reason: raw.message ?? "paystack_init_failed", raw };
  }

  // Iron Rule #2: initialization succeeding only means Paystack accepted the
  // request and issued a redirect -- never COMPLETED here.
  return {
    ok: true,
    status: "PENDING",
    gatewayTransactionId: raw.data?.reference,
    redirectUrl: raw.data?.authorization_url,
    raw,
  };
}

async function queryStatus(gatewayReference: string): Promise<TerminalStatus> {
  const res = await fetch(
    `${baseUrl()}/transaction/verify/${encodeURIComponent(gatewayReference)}`,
    { method: "GET", headers: authHeaders() }
  );
  const raw = (await res.json()) as PaystackVerifyResponse;

  if (!raw.status) {
    return { status: "FAILED", reason: raw.message ?? "paystack_verify_failed", raw };
  }

  const txStatus = raw.data?.status;
  if (txStatus === "success") {
    if (raw.data?.id === undefined) return { status: "PENDING" };
    return {
      status: "COMPLETED",
      gatewayTransactionId: String(raw.data.id),
      raw,
    };
  }
  if (txStatus === "failed" || txStatus === "abandoned" || txStatus === "reversed") {
    return { status: "FAILED", reason: txStatus, raw };
  }
  return { status: "PENDING" };
}

function validateCallback(rawBody: string, headers: Headers): boolean {
  const signatureHeader = headers.get("x-paystack-signature");
  if (!signatureHeader) return false;

  let secret: string;
  try {
    secret = secretKey();
  } catch {
    return false;
  }

  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signatureHeader, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

export const paystackGateway: PaymentGateway = {
  gateway: "PAYSTACK",
  chargeCurrency: "KES",
  supportedMethods: ["MPESA"],
  initiatePayment,
  queryStatus,
  validateCallback,
};
