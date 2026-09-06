/**
 * POST /api/payments/callback/[gateway] -- gateway webhook/callback receiver
 * (U12/U23, Iron Rules #2 and #8).
 *
 * The callback body is NEVER trusted for payment status, even when its
 * signature is valid -- it only tells us "go re-check this reference now".
 * The authoritative outcome always comes from `adapter.queryStatus()`,
 * persisted via the same guarded-update path the reconciliation cron uses
 * (src/lib/payments/settle.ts), so a callback racing the cron on the same
 * payment can only ever apply its side effects once.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { getGateway } from "@/lib/payments/gateway";
import { settlePayment } from "@/lib/payments/settle";

const VALID_GATEWAYS = new Set(["WAAFIPAY", "EDAHAB", "PAYSTACK"]);

/**
 * Best-effort extraction of a gateway reference to LOOK UP the Payment row
 * only -- never used to decide status. Tries the gateway's own common field
 * names, falling back to a `reference` query-string param (the only signal
 * eDahab's browser-facing returnUrl redirect can carry, since it has no
 * server-to-server callback at all).
 */
function extractGatewayReference(gateway: string, rawBody: string, url: URL): string | null {
  const fromQuery = url.searchParams.get("reference") ?? url.searchParams.get("gatewayReference");

  let parsed: unknown = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (gateway === "WAAFIPAY") {
      const params = obj.params as Record<string, unknown> | undefined;
      const txInfo = params?.transactionInfo as Record<string, unknown> | undefined;
      const ref = txInfo?.referenceId ?? params?.referenceId;
      if (typeof ref === "string") return ref;
    }
    if (gateway === "PAYSTACK") {
      const data = obj.data as Record<string, unknown> | undefined;
      const ref = data?.reference;
      if (typeof ref === "string") return ref;
    }
    if (gateway === "EDAHAB") {
      const ref = obj.ReferenceId;
      if (typeof ref === "string") return ref;
    }
  }

  return fromQuery;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ gateway: string }> }
): Promise<NextResponse> {
  // MUST be read first, before any JSON parsing -- required for signature
  // verification over the exact bytes the gateway sent.
  const rawBody = await request.text();

  const { gateway: gatewayParam } = await context.params;
  const gateway = gatewayParam.toUpperCase();

  if (!VALID_GATEWAYS.has(gateway)) {
    return NextResponse.json({ error: { code: "unknown_gateway" } }, { status: 400 });
  }

  const { threshold } = getRateLimitConfig("webhook");
  const ip = getClientIP(request);
  const rateLimitResult = rateLimiter.check(`callback:${gateway}:${ip}`, threshold);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limit_exceeded" } },
      { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
    );
  }

  const adapter = getGateway(gateway as "WAAFIPAY" | "EDAHAB" | "PAYSTACK");

  if (adapter.validateCallback) {
    const valid = adapter.validateCallback(rawBody, request.headers);
    if (!valid) {
      logger.warn("payment_callback_invalid_signature", { gateway });
      return NextResponse.json({ error: { code: "invalid_signature" } }, { status: 401 });
    }
  }
  // eDahab has no validateCallback -- any inbound hit here is treated purely
  // as a hint to re-run queryStatus below; no field of `rawBody` is ever
  // read for status for that gateway.

  const url = new URL(request.url);
  const gatewayReference = extractGatewayReference(gateway, rawBody, url);
  if (!gatewayReference) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const payment = await db.payment.findFirst({
    where: { gateway: gateway as "WAAFIPAY" | "EDAHAB" | "PAYSTACK", gatewayReference },
  });
  if (!payment) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }

  if (payment.status !== "PENDING") {
    // Already resolved by a prior delivery or the reconciliation cron --
    // idempotent no-op. Gateways retry on non-200, so still return 200.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const terminal = await adapter.queryStatus(gatewayReference);

    if (terminal.status === "PENDING") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await db.$transaction(async (tx) => {
      if (terminal.status === "COMPLETED") {
        await settlePayment(tx, payment, {
          kind: "COMPLETED",
          gatewayTransactionId: terminal.gatewayTransactionId,
          raw: terminal.raw,
        });
      } else {
        await settlePayment(tx, payment, {
          kind: "FAILED",
          reason: terminal.reason,
          raw: terminal.raw,
        });
      }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error("payment_callback_processing_failed", {
      gateway,
      paymentId: payment.id,
      error: error instanceof Error ? error.message : String(error),
    });
    // Still 200: the reconciliation cron will pick this payment up shortly,
    // and returning a 5xx here would just cause the gateway to hammer this
    // endpoint with retries for no benefit.
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
