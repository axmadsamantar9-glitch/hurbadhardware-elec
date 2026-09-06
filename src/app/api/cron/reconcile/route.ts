/**
 * GET /api/cron/reconcile -- runs every 2 minutes (U23, Iron Rule #2). Same
 * bearer CRON_SECRET auth as fx-rates (src/lib/payments/cron-auth.ts).
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/payments/cron-auth";
import { reconcilePendingPayments } from "@/lib/payments/reconcile";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

  const summary = await reconcilePendingPayments();
  logger.info("reconcile_run_complete", { ...summary });

  return NextResponse.json({ ok: true, ...summary }, { status: 200 });
}
