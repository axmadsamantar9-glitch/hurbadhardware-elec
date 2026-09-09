/**
 * Warranty registration (HUB-42 AC3 / AC9).
 *
 * Two entry points:
 *   - `registerWarrantyForOrderItem`: the single source of truth for turning
 *     one OrderItem into a Warranty row, used by both the live manual-admin
 *     path (POST /api/admin/warranties/register) and the automatic helper
 *     below. Idempotent via `upsert` on the unique `orderItemId` -- calling
 *     it twice for the same order item is a no-op the second time, never a
 *     duplicate-row error or a silent overwrite of an already-registered
 *     warranty's snapshot.
 *   - `registerWarrantiesForDeliveredOrder`: loops every item on an order and
 *     registers each with source AUTOMATIC. No live call site invokes this
 *     yet -- see the TODO below.
 */

import type { Prisma } from "@prisma/client";
import { calculateWarrantyStatus } from "@/lib/warranty/status";

export interface RegisterWarrantyForOrderItemParams {
  orderItemId: string;
  source: "AUTOMATIC" | "MANUAL";
  registeredByUserId?: string;
}

/**
 * Loads the order item (+ order, + order's status history, + product) inside
 * `tx`, computes AC9 snapshots, and upserts the Warranty row keyed on the
 * unique `orderItemId` (idempotency guard, not check-then-insert -- avoids a
 * TOCTOU race if this is ever called concurrently for the same item).
 *
 * Throws if the order item doesn't exist -- callers are expected to have
 * already validated the id (e.g. the admin route 404s first).
 */
export async function registerWarrantyForOrderItem(
  tx: Prisma.TransactionClient,
  params: RegisterWarrantyForOrderItemParams
): Promise<{ id: string }> {
  const { orderItemId, source, registeredByUserId } = params;

  const orderItem = await tx.orderItem.findUniqueOrThrow({
    where: { id: orderItemId },
    include: {
      order: {
        include: {
          statusHistory: { where: { status: "DELIVERED" }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
      product: true,
    },
  });

  const deliveredRow = orderItem.order.statusHistory[0] ?? null;
  const deliveryDate = deliveredRow?.createdAt ?? null;
  const startDate = deliveryDate;

  const warrantyMonthsSnapshot = orderItem.product?.warrantyMonths ?? null;

  const expiryDate =
    startDate && warrantyMonthsSnapshot !== null
      ? (() => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + warrantyMonthsSnapshot);
          return d;
        })()
      : null;

  const status = calculateWarrantyStatus({
    warrantyMonths: warrantyMonthsSnapshot,
    startDate,
    voidedAt: null,
  });

  const warranty = await tx.warranty.upsert({
    where: { orderItemId },
    create: {
      orderId: orderItem.orderId,
      orderItemId: orderItem.id,
      userId: orderItem.order.userId,
      productId: orderItem.productId,
      variantId: orderItem.variantId,
      skuSnapshot: orderItem.product?.sku ?? null,
      productNameSnapshotEn: orderItem.nameSnapshotEn,
      productNameSnapshotSo: orderItem.nameSnapshotSo,
      warrantyMonthsSnapshot,
      deliveryDate,
      startDate,
      expiryDate,
      status,
      registrationSource: source,
      registeredByUserId: registeredByUserId ?? null,
    },
    // Idempotency guard: a second call for the same order item is a no-op,
    // never a silent overwrite of an existing warranty's snapshot/status.
    update: {},
  });

  return { id: warranty.id };
}

/**
 * Registers a Warranty for every item on `orderId`, source AUTOMATIC.
 *
 * TODO(HUB-46): wire this to the real DELIVERED-transition call site once
 * admin fulfillment exists. No such call site exists yet in this codebase
 * (order status is currently never programmatically transitioned to
 * DELIVERED outside of manual/seed data) -- this function is ready to be
 * invoked from that flow the moment it lands, but is deliberately unwired
 * for now rather than attached to a fabricated call site.
 */
export async function registerWarrantiesForDeliveredOrder(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<void> {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { id: true } });
  for (const item of items) {
    await registerWarrantyForOrderItem(tx, { orderItemId: item.id, source: "AUTOMATIC" });
  }
}
