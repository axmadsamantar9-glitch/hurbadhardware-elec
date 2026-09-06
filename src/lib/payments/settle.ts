/**
 * Shared terminal-state persistence for a Payment, reused by BOTH the
 * webhook/callback handler (src/app/api/payments/callback/[gateway]/route.ts)
 * and the reconciliation cron (src/lib/payments/reconcile.ts) -- this is the
 * one place Order/Payment/stock/audit side effects of a payment reaching a
 * terminal state are written, so the callback-vs-cron race always resolves
 * through the identical guarded-update code path (Iron Rule #8: webhook
 * state machine prevents impossible transitions; exactly one caller's
 * guarded update can ever win).
 *
 * Deviation note: OrderStatus has no "FAILED" value (PLACED/PROCESSING/
 * SHIPPED/DELIVERED/CANCELLED only -- see prisma/schema.prisma). A failed
 * payment maps Order.status to CANCELLED (the closest existing terminal
 * enum value) while Order.paymentStatus carries the precise FAILED signal.
 * This is a deliberate interpretation, not a schema gap requiring migration
 * -- flagged here for visibility per HUB-40's reporting requirement.
 */

import type { Prisma, Payment } from "@prisma/client";
import { applyStockDelta } from "@/lib/inventory";
import { writeAuditLog } from "@/lib/audit";

export type SettleOutcome =
  | { kind: "COMPLETED"; gatewayTransactionId: string; raw: unknown }
  | { kind: "FAILED"; reason: string; raw: unknown }
  | { kind: "EXPIRED" };

/**
 * Applies `outcome` to `payment` inside the caller's transaction. Returns
 * `true` if this call actually won the guarded update (payment was still
 * PENDING at the moment of the update), `false` if it was a no-op because
 * another delivery/poll already resolved it -- callers must treat `false` as
 * "nothing more to do", never retry or double-apply side effects.
 */
export async function settlePayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
  outcome: SettleOutcome
): Promise<boolean> {
  const newStatus =
    outcome.kind === "COMPLETED" ? "COMPLETED" : outcome.kind === "FAILED" ? "FAILED" : "EXPIRED";

  const updateData: Prisma.PaymentUpdateManyMutationInput = { status: newStatus };
  if (outcome.kind === "COMPLETED") {
    updateData.gatewayTransactionId = outcome.gatewayTransactionId;
    updateData.callbackPayload = outcome.raw as Prisma.InputJsonValue;
  } else if (outcome.kind === "FAILED") {
    updateData.callbackPayload = outcome.raw as Prisma.InputJsonValue;
  }

  // The guarded conditional UPDATE (WHERE status = 'PENDING') is the dedup
  // mechanism against duplicate/racing deliveries -- identical pattern to
  // applyStockDelta's guarded UPDATE in src/lib/inventory.ts.
  const guarded = await tx.payment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: updateData,
  });
  if (guarded.count === 0) return false;

  const order = await tx.order.findUnique({
    where: { id: payment.orderId },
    include: { items: true },
  });
  if (!order) return true;

  if (outcome.kind === "COMPLETED") {
    const orderUpdate = await tx.order.updateMany({
      where: { id: order.id, status: "PLACED" },
      data: { paymentStatus: "COMPLETED", status: "PROCESSING" },
    });
    if (orderUpdate.count > 0) {
      await tx.orderStatusHistory.create({ data: { orderId: order.id, status: "PROCESSING" } });
    } else {
      // Order already moved past PLACED for some other reason (e.g. an
      // admin action) -- still record the payment outcome, but don't force
      // a status transition or history row that didn't really happen.
      await tx.order.updateMany({ where: { id: order.id }, data: { paymentStatus: "COMPLETED" } });
    }
    return true;
  }

  if (outcome.kind === "FAILED") {
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "FAILED", status: "CANCELLED" },
    });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: "CANCELLED" } });
    for (const item of order.items) {
      if (!item.productId) continue;
      await applyStockDelta(tx, {
        productId: item.productId,
        variantId: item.variantId,
        delta: item.quantity,
      });
      await tx.inventoryLog.create({
        data: {
          productId: item.productId,
          variantId: item.variantId,
          delta: item.quantity,
          reason: "order_payment_failed",
          referenceType: "order",
          referenceId: order.id,
          createdBy: null,
        },
      });
    }
    return true;
  }

  // EXPIRED: payment sat PENDING past the reconciliation cron's expiry
  // window. Stock is restored (same as FAILED) but Order.status is
  // deliberately left as-is -- the customer's order isn't cancelled
  // automatically, it's flagged for admin review via paymentStatus=EXPIRED
  // plus this AuditLog row.
  await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "EXPIRED" } });
  for (const item of order.items) {
    if (!item.productId) continue;
    await applyStockDelta(tx, {
      productId: item.productId,
      variantId: item.variantId,
      delta: item.quantity,
    });
    await tx.inventoryLog.create({
      data: {
        productId: item.productId,
        variantId: item.variantId,
        delta: item.quantity,
        reason: "order_payment_expired",
        referenceType: "order",
        referenceId: order.id,
        createdBy: null,
      },
    });
  }
  await writeAuditLog(tx, {
    actorId: null,
    action: "order.payment_expired",
    entityType: "order",
    entityId: order.id,
    before: { paymentStatus: payment.status },
    after: { paymentStatus: "EXPIRED" },
  });

  return true;
}
