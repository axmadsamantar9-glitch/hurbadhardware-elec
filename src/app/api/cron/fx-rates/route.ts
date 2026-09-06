/**
 * GET /api/cron/fx-rates -- hourly FX rate refresh (U23).
 *
 * Fetches USD->KES from the configured provider and INSERTS one new FxRate
 * row -- never updates in place, so two rapid/overlapping runs simply
 * produce two rows with no dedup logic needed. Bearer CRON_SECRET auth,
 * fail-closed (src/lib/payments/cron-auth.ts).
 */

import { NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isAuthorizedCronRequest } from "@/lib/payments/cron-auth";
import { HttpFxRateProvider, type FxRateProvider } from "@/lib/currency/rates";

/** Platform spread applied on top of the raw provider rate, in the
 * platform's favor (see src/lib/currency/convert.ts). Not a HUB-40-specified
 * env var; a conservative default kept as a plain named constant so it is
 * trivial for a future pricing decision to change in one place. */
const DEFAULT_SPREAD_PCT = new Decimal(2);

// Swappable for tests -- never a hardcoded singleton import used directly
// inside the handler.
let provider: FxRateProvider = new HttpFxRateProvider();
export function __setFxRateProviderForTest(p: FxRateProvider): void {
  provider = p;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

  try {
    const result = await provider.fetchRate("USD", "KES");

    await db.fxRate.create({
      data: {
        base: "USD",
        quote: "KES",
        rate: result.rate,
        spreadPct: DEFAULT_SPREAD_PCT,
        source: result.source,
        fetchedAt: result.fetchedAt,
      },
    });

    logger.info("fx_rate_refreshed", { source: result.source });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error("fx_rate_refresh_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: { code: "internal_error" } }, { status: 500 });
  }
}
