/**
 * FX rate persistence/read layer (U23).
 *
 * `getRate()` NEVER makes a network call -- it only reads the newest FxRate
 * row already persisted in the DB. The one and only network fetch happens in
 * the fx-rates cron (src/app/api/cron/fx-rates/route.ts), which inserts a
 * new row every run (never updates in place -- two rapid runs just produce
 * two rows, no dedup needed).
 */

import type { Decimal } from "@prisma/client/runtime/library";
import { db } from "@/lib/db";
import { StaleRateError } from "@/lib/payments/errors";

/** Hours after which the newest persisted FxRate is considered too old to
 * safely price an order. A named constant, not an env var -- deliberately
 * not independently configurable per HUB-40's design.
 *
 * Set to cover the actual fetch cadence: the fx-rates cron (vercel.json)
 * can only run once per day on Vercel's Hobby plan (higher frequencies are
 * rejected at deploy time), so this must comfortably exceed 24h or every
 * KES checkout would fail for most of the day between runs. 26h gives a
 * 2h buffer past the 24h cycle for cron execution jitter. If the cron
 * cadence is ever restored to hourly (e.g. via an external scheduler
 * calling this route instead of Vercel's own cron, or a Pro-plan upgrade),
 * this should come back down to a tighter window (it was 6h before this
 * change) -- a stale FX rate priced in USD->KES conversion is a real
 * money-correctness risk, not just a staleness nicety. */
export const FX_STALE_HOURS = 26;

export interface FxRateResult {
  rate: Decimal;
  source: string;
  fetchedAt: Date;
}

/** Fetches a fresh rate from an external provider. Swappable/mockable via
 * constructor injection -- never a hardcoded singleton import inside code
 * under test. */
export interface FxRateProvider {
  fetchRate(base: "USD", quote: "KES"): Promise<FxRateResult>;
}

/**
 * Concrete provider hitting FX_PROVIDER_BASE_URL. The exact response shape
 * is unconfirmed without live credentials (FX_PROVIDER_API_KEY/
 * FX_PROVIDER_BASE_URL are blank in this environment) -- kept isolated to
 * this one class so a later correction can't leak elsewhere.
 */
export class HttpFxRateProvider implements FxRateProvider {
  async fetchRate(base: "USD", quote: "KES"): Promise<FxRateResult> {
    const baseUrl = process.env.FX_PROVIDER_BASE_URL;
    const apiKey = process.env.FX_PROVIDER_API_KEY;
    if (!baseUrl) throw new Error("FX_PROVIDER_BASE_URL is not configured");

    const res = await fetch(`${baseUrl}/latest?base=${base}&quote=${quote}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    const json = (await res.json()) as { rate: string | number; source?: string };

    const { Decimal: DecimalCtor } = await import("@prisma/client/runtime/library");
    return {
      rate: new DecimalCtor(json.rate),
      source: json.source ?? baseUrl,
      fetchedAt: new Date(),
    };
  }
}

export interface StoredRate {
  rate: Decimal;
  spreadPct: Decimal;
  source: string;
  fetchedAt: Date;
}

/**
 * Reads the newest persisted USD->KES FxRate row. No network call. Throws
 * StaleRateError if no row exists yet, or the newest row's `fetchedAt` is
 * older than FX_STALE_HOURS -- callers (checkout) must roll back rather than
 * price an order off a stale rate.
 */
export async function getRate(base: "USD", quote: "KES"): Promise<StoredRate> {
  const row = await db.fxRate.findFirst({
    where: { base, quote },
    orderBy: { fetchedAt: "desc" },
  });

  if (!row) {
    throw new StaleRateError(`No FxRate row exists yet for ${base}->${quote}`);
  }

  const ageMs = Date.now() - row.fetchedAt.getTime();
  const staleMs = FX_STALE_HOURS * 60 * 60 * 1000;
  if (ageMs > staleMs) {
    throw new StaleRateError(
      `Newest FxRate row for ${base}->${quote} is ${(ageMs / (60 * 60 * 1000)).toFixed(2)}h old, exceeds FX_STALE_HOURS=${FX_STALE_HOURS}`
    );
  }

  return {
    rate: row.rate,
    spreadPct: row.spreadPct,
    source: row.source,
    fetchedAt: row.fetchedAt,
  };
}
