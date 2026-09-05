/**
 * Order-management data layer (HUB-39, U14 / PRD R14).
 *
 * Three read paths, all sharing the same status-timeline shaping:
 *   - getOrdersForUser(userId): list, newest first (AC1).
 *   - getOrderDetailForUser(userId, orderId): single order, ownership-scoped
 *     IN THE WHERE CLAUSE (never a post-fetch `if` check) so a wrong or
 *     nonexistent order id both collapse into the same `null` result (AC2).
 *   - trackOrder(orderIdSuffix, email): public, no auth -- matches by
 *     order-id suffix AND the owning user's email, filtered in application
 *     code (Prisma has no case-insensitive `endsWith` + join-column compare
 *     in one query); returns a deliberately reduced shape (AC5).
 *
 * Money fields are converted from Prisma `Decimal` to `number` at this
 * boundary (matches src/lib/api/checkout.ts's convention) so callers/route
 * handlers never need to import `Decimal` or call `.toNumber()` themselves.
 */

import { db } from "@/lib/db";
import type { Order, OrderItem, OrderStatusHistory, OrderStatus } from "@prisma/client";

export interface OrderListItem {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  itemCount: number;
  totalUsd: number;
}

export interface OrderItemView {
  id: string;
  productId: string | null;
  nameSnapshotEn: string;
  nameSnapshotSo: string;
  quantity: number;
  unitPriceUsd: number;
}

export interface OrderStatusHistoryView {
  status: OrderStatus;
  createdAt: Date;
}

export interface OrderTotals {
  subtotalUsd: number;
  discountUsd: number;
  taxUsd: number;
  totalUsd: number;
}

export interface OrderDetailView {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  trackingNumber: string | null;
  items: OrderItemView[];
  statusHistory: OrderStatusHistoryView[];
  totals: OrderTotals;
  shippingAddress: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string | null;
    country: string;
  } | null;
  paymentMethod: string | null;
}

export interface TrackedOrderView {
  id: string;
  status: OrderStatus;
  trackingNumber: string | null;
  items: Array<{ nameSnapshotEn: string; nameSnapshotSo: string; quantity: number }>;
  statusHistory: OrderStatusHistoryView[];
  totals: OrderTotals;
}

function toItemView(item: OrderItem): OrderItemView {
  return {
    id: item.id,
    productId: item.productId,
    nameSnapshotEn: item.nameSnapshotEn,
    nameSnapshotSo: item.nameSnapshotSo,
    quantity: item.quantity,
    unitPriceUsd: item.unitPriceUsd.toNumber(),
  };
}

function toHistoryView(history: OrderStatusHistory[]): OrderStatusHistoryView[] {
  return history.map((h) => ({ status: h.status, createdAt: h.createdAt }));
}

function toTotals(order: Order): OrderTotals {
  return {
    subtotalUsd: order.subtotalUsd.toNumber(),
    discountUsd: order.discountUsd.toNumber(),
    taxUsd: order.taxUsd.toNumber(),
    totalUsd: order.totalUsd.toNumber(),
  };
}

/** List a user's own orders, newest first (AC1). */
export async function getOrdersForUser(userId: string): Promise<OrderListItem[]> {
  const orders = await db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { quantity: true } } },
  });

  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    totalUsd: order.totalUsd.toNumber(),
  }));
}

/**
 * Fetch a single order's detail, scoped to `userId` in the `where` clause
 * itself -- an order that exists but belongs to someone else returns `null`,
 * identically to an order id that doesn't exist at all (AC2).
 */
export async function getOrderDetailForUser(
  userId: string,
  orderId: string
): Promise<OrderDetailView | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, userId },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      shippingAddress: true,
    },
  });

  if (!order) return null;

  return {
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    trackingNumber: order.trackingNumber,
    items: order.items.map(toItemView),
    statusHistory: toHistoryView(order.statusHistory),
    totals: toTotals(order),
    shippingAddress: order.shippingAddress
      ? {
          fullName: order.shippingAddress.fullName,
          phone: order.shippingAddress.phone,
          addressLine1: order.shippingAddress.addressLine1,
          addressLine2: order.shippingAddress.addressLine2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          country: order.shippingAddress.country,
        }
      : null,
    paymentMethod: order.paymentMethod,
  };
}

/**
 * Public order lookup by last-4-of-order-id + email (AC5). Zero matches for
 * ANY reason (no such suffix, suffix matches an order but the email doesn't,
 * order has no linked user/email at all) all return `null` uniformly -- the
 * caller (POST /api/track) turns that into one generic 404, never
 * differentiating why, so this can't be used as an email-existence oracle.
 *
 * Returns a deliberately reduced shape: no shipping address, no payment
 * method, no per-item unit price -- only what's needed to answer "where's my
 * order" (Iron Rule #6).
 */
export async function trackOrder(
  orderIdSuffix: string,
  email: string
): Promise<TrackedOrderView | null> {
  const normalizedSuffix = orderIdSuffix.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedSuffix || !normalizedEmail) return null;

  const candidates = await db.order.findMany({
    where: { id: { endsWith: normalizedSuffix } },
    include: {
      user: { select: { email: true } },
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });

  const match = candidates.find((o) => o.user?.email?.toLowerCase() === normalizedEmail);
  if (!match) return null;

  return {
    id: match.id,
    status: match.status,
    trackingNumber: match.trackingNumber,
    items: match.items.map((i) => ({
      nameSnapshotEn: i.nameSnapshotEn,
      nameSnapshotSo: i.nameSnapshotSo,
      quantity: i.quantity,
    })),
    statusHistory: toHistoryView(match.statusHistory),
    totals: toTotals(match),
  };
}
