/**
 * Shared status-timeline shaping for order detail (AC3) and public tracking
 * (AC5) — both render the same Placed -> Processing -> Shipped -> Delivered
 * (or -> Cancelled) sequence from an OrderStatusHistory[] read.
 */

import type { OrderStatus } from "@prisma/client";

export const ORDER_FLOW: readonly OrderStatus[] = [
  "PLACED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

export interface OrderTimelineStage {
  status: OrderStatus;
  /** Timestamp this stage was reached, or `null` if not reached yet. */
  timestamp: Date | null;
}

/**
 * Build the ordered stage list to render. If the order was cancelled, only
 * the stages actually reached before cancellation are shown, followed by
 * CANCELLED — no "future" stages are implied for a cancelled order. If the
 * order is still progressing normally, all four PLACED/PROCESSING/SHIPPED/
 * DELIVERED stages are shown, with `timestamp: null` for any not yet reached
 * (rendered as pending/upcoming by the UI).
 */
export function buildOrderTimeline(
  history: Array<{ status: OrderStatus; createdAt: Date }>
): OrderTimelineStage[] {
  const reachedAt = new Map<OrderStatus, Date>();
  for (const entry of history) {
    // history is expected ascending by createdAt; keep the first time a
    // status was reached if a status somehow repeats.
    if (!reachedAt.has(entry.status)) {
      reachedAt.set(entry.status, entry.createdAt);
    }
  }

  const isCancelled = reachedAt.has("CANCELLED");

  const sequence: OrderStatus[] = isCancelled
    ? [...ORDER_FLOW.filter((s) => reachedAt.has(s)), "CANCELLED"]
    : [...ORDER_FLOW];

  if (sequence.length === 0 || sequence[0] !== "PLACED") {
    sequence.unshift("PLACED");
  }

  return sequence.map((status) => ({
    status,
    timestamp: reachedAt.get(status) ?? null,
  }));
}
