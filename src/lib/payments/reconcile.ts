/**
 * Reconciliation sweep (U23, Iron Rule #2). Guarantees every payment reaches
 * a terminal state even when a gateway callback is dropped, delayed, or
 * never sent (eDahab has no server callback at all).
 *
 * Selection: PENDING payments older than RECONCILE_MIN_AGE_MS, oldest first,
 * capped at BATCH_SIZE per run. Each payment gets its own `db.$transaction`
 * wrapped in try/catch so one failure (e.g. a gateway timeout) never aborts
 * the rest of the batch.
 */

import type { Payment } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getGateway } from "@/lib/payments/gateway";
import { settlePayment } from "@/lib/payments/settle";

export const BATCH_SIZE = 50;
/** Only consider payments at least this old -- avoids racing a payment
 * still in its normal initiate-then-callback window. */
export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
/** A payment is EXPIRED once it has sat PENDING this long. */
export const EXPIRY_AGE_MS = 30 * 60 * 1000;
/** Backoff cap, in minutes, for `min(2^pollAttempts, cap)`. */
export const BACKOFF_CAP_MINUTES = 5;

export interface ReconcileSummary {
  scanned: number;
  completed: number;
  failed: number;
  expired: number;
  stillPending: number;
  erroredPolls: number;
}

function backoffMinutes(pollAttempts: number): number {
  return Math.min(2 ** pollAttempts, BACKOFF_CAP_MINUTES);
}

/** True if this row should be skipped THIS run because it was polled too
 * recently relative to its own backoff window (application-level guard, not
 * part of the SQL selection). */
function shouldSkipForBackoff(payment: Payment, now: Date): boolean {
  if (!payment.lastPolledAt) return false;
  const minutesSincePoll = (now.getTime() - payment.lastPolledAt.getTime()) / (60 * 1000);
  return minutesSincePoll < backoffMinutes(payment.pollAttempts);
}

export async function reconcilePendingPayments(): Promise<ReconcileSummary> {
  const now = new Date();
  const summary: ReconcileSummary = {
    scanned: 0,
    completed: 0,
    failed: 0,
    expired: 0,
    stillPending: 0,
    erroredPolls: 0,
  };

  const candidates = await db.payment.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const payment of candidates) {
    if (shouldSkipForBackoff(payment, now)) continue;
    summary.scanned += 1;

    try {
      const adapter = getGateway(payment.gateway);
      const terminal = await adapter.queryStatus(payment.gatewayReference);

      if (terminal.status === "PENDING") {
        const isExpired = now.getTime() - payment.createdAt.getTime() > EXPIRY_AGE_MS;
        if (isExpired) {
          await db.$transaction(async (tx) => {
            await settlePayment(tx, payment, { kind: "EXPIRED" });
          });
          summary.expired += 1;
        } else {
          await db.payment.updateMany({
            where: { id: payment.id, status: "PENDING" },
            data: { pollAttempts: { increment: 1 }, lastPolledAt: now },
          });
          summary.stillPending += 1;
        }
        continue;
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
      if (terminal.status === "COMPLETED") summary.completed += 1;
      else summary.failed += 1;
    } catch (error) {
      // queryStatus threw / gateway unreachable -- record the attempt and
      // move on. One payment's failure must never abort the whole run.
      logger.warn("reconcile_poll_failed", {
        paymentId: payment.id,
        gateway: payment.gateway,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        await db.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { pollAttempts: { increment: 1 }, lastPolledAt: now },
        });
      } catch (innerError) {
        logger.error("reconcile_poll_failure_record_failed", {
          paymentId: payment.id,
          error: innerError instanceof Error ? innerError.message : String(innerError),
        });
      }
      summary.erroredPolls += 1;
    }
  }

  return summary;
}
