/**
 * POST /api/payments/initiate -- kicks off the gateway-side payment for an
 * already-placed order (U12). Body: { orderId }.
 *
 * Ownership is enforced in the query's `where` clause itself (same
 * convention as src/lib/api/orders.ts's getOrderDetailForUser) -- an order
 * that exists but belongs to someone else returns the identical 404 as one
 * that doesn't exist at all.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { getGateway } from "@/lib/payments/gateway";

const InitiateSchema = z.object({ orderId: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { threshold } = getRateLimitConfig("checkout");
    const rateLimitResult = rateLimiter.check(`payments-initiate:${userId}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = InitiateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Invalid request body", code: "validation_error" } },
        { status: 400 }
      );
    }

    // Ownership-scoped in the WHERE clause -- an order id that exists but
    // belongs to someone else is indistinguishable from one that doesn't
    // exist at all.
    const payment = await db.payment.findFirst({
      where: { orderId: parsed.data.orderId, order: { userId } },
      include: { order: { include: { shippingAddress: true } } },
    });
    if (!payment) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }

    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { ok: true, status: payment.status, gatewayTransactionId: payment.gatewayTransactionId },
        { status: 200 }
      );
    }

    const adapter = getGateway(payment.gateway);
    const result = await adapter.initiatePayment({
      gatewayReference: payment.gatewayReference,
      amountUsd: payment.amountUsd,
      chargeAmount: payment.chargeAmount,
      chargeCurrency: payment.chargeCurrency,
      method: payment.method,
      orderId: payment.orderId,
      customerPhone: payment.order.shippingAddress?.phone,
      customerEmail: session.user.email ?? undefined,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/payments/return?orderId=${payment.orderId}`,
    });

    if (!result.ok) {
      logger.warn("payment_initiate_failed", { paymentId: payment.id, reason: result.reason });
      return NextResponse.json(
        { ok: false, error: { code: "gateway_rejected", reason: result.reason } },
        { status: 502 }
      );
    }

    if (result.gatewayTransactionId) {
      await db.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { gatewayTransactionId: result.gatewayTransactionId },
      });
    }

    return NextResponse.json(
      { ok: true, status: "PENDING", redirectUrl: result.redirectUrl },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("payment_initiate_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to initiate payment", code: "internal_error" } },
      { status: 500 }
    );
  }
}
