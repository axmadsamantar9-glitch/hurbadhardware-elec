/**
 * USD -> chargeCurrency conversion (U23). Zero floating-point arithmetic
 * anywhere in this file -- Decimal end to end.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { getRate } from "./rates";

export interface ConversionResult {
  chargeAmount: Decimal;
  chargeCurrency: "USD" | "KES";
  /** The EFFECTIVE rate actually applied (provider rate x spread), not the
   * raw provider rate -- this is the one number that can reconstruct
   * chargeAmount from amountUsd later with no second column. Null for USD
   * (no conversion applied). */
  fxRate: Decimal | null;
  fxRateAt: Date | null;
}

/**
 * Converts a USD amount to `target`. For USD, an identity passthrough
 * (rounded to 2dp, no rate involved). For KES, reads the newest persisted FX
 * rate (DB read only -- safe inside an outer transaction), applies the
 * platform's spread in the platform's favor, and rounds UP (ROUND_CEIL) so
 * FX drift between rate-fetch and settlement is covered by the spread,
 * never absorbed as a loss.
 */
export async function convert(
  amountUsd: Decimal,
  target: "USD" | "KES"
): Promise<ConversionResult> {
  if (target === "USD") {
    return {
      chargeAmount: amountUsd.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      chargeCurrency: "USD",
      fxRate: null,
      fxRateAt: null,
    };
  }

  const stored = await getRate("USD", "KES");
  const effectiveRate = stored.rate.mul(new Decimal(1).plus(stored.spreadPct.div(100)));
  const chargeAmount = amountUsd.mul(effectiveRate).toDecimalPlaces(0, Decimal.ROUND_CEIL);

  return {
    chargeAmount,
    chargeCurrency: "KES",
    fxRate: effectiveRate,
    fxRateAt: stored.fetchedAt,
  };
}
