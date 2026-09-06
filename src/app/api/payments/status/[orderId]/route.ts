/**
 * GET /api/payments/status/[orderId] -- ownership-scoped payment status
 * lookup (U12/U23, Iron Rule #2).
 *
 * If the persisted Payment row is already terminal (COMPLETED/FAILED/
 * EXPIRED), that's returned directly -- no need to re-poll a gateway for a
 * status that can no longer change. If it's still PENDING, this is exactly
 * the case where "stale" would be actively misleading (the customer is
 * likely staring at a spinner), so a live `queryStatus()` call is cheap and
 * worth it here, persisted via the same guarded-update path as the webhook
 * handler and the reconciliation cron.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getGateway } from "@/lib/payments/gateway";
import { settlePayment } from "@/lib/payments/settle";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { message: "Authentication required", code: "unauthorized" } },
      { status: 401 }
    );
  }
  const userId = session.user.id;
  const { orderId } = await context.params;

  const payment = await db.payment.findFirst({
    where: { orderId, order: { userId } },
  });
  if (!payment) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json(
      { status: payment.status, gatewayTransactionId: payment.gatewayTransactionId },
      { status: 200 }
    );
  }

  try {
    const adapter = getGateway(payment.gateway);
    const terminal = await adapter.queryStatus(payment.gatewayReference);

    if (terminal.status === "PENDING") {
      return NextResponse.json({ status: "PENDING" }, { status: 200 });
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

    return NextResponse.json({ status: terminal.status }, { status: 200 });
  } catch (error) {
    logger.error("payment_status_query_failed", {
      paymentId: payment.id,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fall back to the last-known persisted status rather than surfacing a
    // 500 to the customer -- the reconciliation cron will keep polling.
    return NextResponse.json({ status: "PENDING" }, { status: 200 });
  }
}
