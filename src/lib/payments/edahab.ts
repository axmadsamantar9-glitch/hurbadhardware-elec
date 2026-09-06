/**
 * eDahab adapter, U12.
 *
 * STRUCTURALLY VERIFIED -- LIVE PROVIDER VERIFICATION PENDING CREDENTIALS
 * (no EDAHAB_BASE_URL/EDAHAB_API_KEY/EDAHAB_API_SECRET/EDAHAB_AGENT_CODE
 * configured in this environment, and no eDahab sandbox exists to test
 * against per docs/agents/run-state.md -- this adapter is never exercised
 * against a live endpoint, including in "just checking" scripts).
 *
 * Exact-string-reuse requirement: eDahab's request hash is computed over the
 * EXACT JSON string sent as the request body, not a re-serialized copy of the
 * same object. `JSON.stringify` on a given object is not guaranteed to
 * produce a byte-identical string on a second call in general (key
 * insertion order, floating point formatting, etc. can all vary depending on
 * how the object was constructed) -- so this file stringifies the payload
 * exactly ONCE into `rawBody` and reuses that string both for hashing and
 * for the HTTP body. See edahab.test.ts for a constructed example where
 * re-serializing the same logical object would NOT reliably reproduce the
 * original string, proving why this matters.
 *
 * eDahab has no server-to-server webhook -- only a browser-facing,
 * attacker-controllable `returnUrl` redirect, which is never trusted for
 * payment status (Iron Rule #2). `queryStatus` via CheckInvoiceStatus is the
 * only trustworthy path; there is deliberately no `validateCallback` here.
 */

import { createHash } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import type { PaymentGateway, InitiateParams, InitiateResult, TerminalStatus } from "./gateway";

interface EdahabInvoiceResponse {
  StatusCode?: number;
  StatusDescription?: string;
  TransactionId?: string;
  InvoiceId?: string;
}

interface EdahabStatusResponse {
  StatusCode?: number;
  StatusDescription?: string;
  TransactionId?: string;
  Amount?: string | number;
}

function baseUrl(): string {
  const url = process.env.EDAHAB_BASE_URL;
  if (!url) throw new Error("EDAHAB_BASE_URL is not configured");
  return url;
}

function apiSecret(): string {
  const secret = process.env.EDAHAB_API_SECRET;
  if (!secret) throw new Error("EDAHAB_API_SECRET is not configured");
  return secret;
}

/** Hashes the EXACT string given -- never re-serializes. Callers must pass
 * the same `rawBody` string used for the HTTP request body. */
function signRawBody(rawBody: string): string {
  return createHash("sha256")
    .update(rawBody + apiSecret())
    .digest("hex");
}

/**
 * eDahab `StatusCode` -> our terminal states.
 *
 * UNCONFIRMED PENDING REAL VENDOR DOCS: eDahab's exact StatusCode enum is
 * not published anywhere this codebase has access to. This mapping is a
 * reasonable structural placeholder (1=pending, 2=success/completed,
 * everything else including 5=failed) kept in exactly one small function so
 * it is trivial to correct in one place once real docs or a sandbox exist --
 * never scatter these magic numbers at call sites.
 */
function mapStatusCode(code: number | undefined): "PENDING" | "COMPLETED" | "FAILED" {
  if (code === 1) return "PENDING";
  if (code === 2) return "COMPLETED";
  return "FAILED";
}

async function initiatePayment(params: InitiateParams): Promise<InitiateResult> {
  // Build the payload object once, stringify it exactly once, and reuse that
  // exact string for both hashing and the request body -- see file header.
  const payload = {
    ApiKey: process.env.EDAHAB_API_KEY,
    AgentCode: process.env.EDAHAB_AGENT_CODE,
    InvoiceId: params.orderId,
    ReferenceId: params.gatewayReference,
    Amount: params.chargeAmount.toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2),
    Currency: params.chargeCurrency,
    PhoneNumber: params.customerPhone ?? "",
    ReturnUrl: params.returnUrl ?? "",
  };
  const rawBody = JSON.stringify(payload);
  const hash = signRawBody(rawBody);

  const res = await fetch(`${baseUrl()}/Issueinvoice?hash=${encodeURIComponent(hash)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
  const raw = (await res.json()) as EdahabInvoiceResponse;

  // Issuing an invoice successfully never means money moved -- eDahab has no
  // server callback at all, so this must always be PENDING pending a later
  // queryStatus() call (Iron Rule #2).
  if (mapStatusCode(raw.StatusCode) === "FAILED") {
    return { ok: false, status: "FAILED", reason: raw.StatusDescription ?? "edahab_rejected", raw };
  }

  return {
    ok: true,
    status: "PENDING",
    gatewayTransactionId: raw.TransactionId,
    raw,
  };
}

async function queryStatus(gatewayReference: string): Promise<TerminalStatus> {
  const payload = { ApiKey: process.env.EDAHAB_API_KEY, ReferenceId: gatewayReference };
  const rawBody = JSON.stringify(payload);
  const hash = signRawBody(rawBody);

  const res = await fetch(`${baseUrl()}/CheckInvoiceStatus?hash=${encodeURIComponent(hash)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
  const raw = (await res.json()) as EdahabStatusResponse;

  const outcome = mapStatusCode(raw.StatusCode);
  if (outcome === "COMPLETED") {
    if (!raw.TransactionId) return { status: "PENDING" };
    return {
      status: "COMPLETED",
      gatewayTransactionId: raw.TransactionId,
      settledAmount: raw.Amount !== undefined ? new Decimal(raw.Amount) : undefined,
      raw,
    };
  }
  if (outcome === "FAILED") {
    return { status: "FAILED", reason: raw.StatusDescription ?? "edahab_query_failed", raw };
  }
  return { status: "PENDING" };
}

export const edahabGateway: PaymentGateway = {
  gateway: "EDAHAB",
  chargeCurrency: "USD",
  supportedMethods: ["EDAHAB"],
  initiatePayment,
  queryStatus,
  // Deliberately no validateCallback -- see file header. Any inbound hit on
  // the callback route for this gateway is treated purely as a hint to
  // re-run queryStatus(), never as a source of status truth.
};
