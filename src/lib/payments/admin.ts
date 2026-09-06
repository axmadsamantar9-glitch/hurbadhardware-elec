/**
 * Read-only admin payment review data layer (U23, AC10).
 *
 * Payment rows an admin should look at: PENDING (still resolving), EXPIRED
 * (needs manual follow-up), and recent FAILED (for visibility). Joined to
 * Order for the operator-facing summary; paginated.
 */

import { db } from "@/lib/db";

export interface PaymentReviewRow {
  id: string;
  orderId: string;
  gateway: string;
  method: string;
  status: string;
  chargeAmount: number;
  chargeCurrency: string;
  createdAt: Date;
  pollAttempts: number;
  lastPolledAt: Date | null;
  orderStatus: string;
  orderTotalUsd: number;
}

export interface ListPaymentsForReviewParams {
  page?: number;
  pageSize?: number;
}

export interface ListPaymentsForReviewResult {
  rows: PaymentReviewRow[];
  total: number;
  page: number;
  pageSize: number;
}

const RECENT_FAILED_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function listPaymentsForReview(
  params: ListPaymentsForReviewParams = {}
): Promise<ListPaymentsForReviewResult> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 25;

  const where = {
    OR: [
      { status: "PENDING" as const },
      { status: "EXPIRED" as const },
      {
        status: "FAILED" as const,
        createdAt: { gt: new Date(Date.now() - RECENT_FAILED_WINDOW_MS) },
      },
    ],
  };

  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { order: { select: { status: true, totalUsd: true } } },
    }),
    db.payment.count({ where }),
  ]);

  return {
    rows: rows.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      gateway: p.gateway,
      method: p.method,
      status: p.status,
      chargeAmount: p.chargeAmount.toNumber(),
      chargeCurrency: p.chargeCurrency,
      createdAt: p.createdAt,
      pollAttempts: p.pollAttempts,
      lastPolledAt: p.lastPolledAt,
      orderStatus: p.order.status,
      orderTotalUsd: p.order.totalUsd.toNumber(),
    })),
    total,
    page,
    pageSize,
  };
}
