/**
 * Display-only currency formatting helpers (U23). Never used for any money
 * math -- purely string presentation of an already-computed Decimal/number.
 */

import type { Decimal } from "@prisma/client/runtime/library";

const LOCALE_BY_CURRENCY: Record<"USD" | "KES", string> = {
  USD: "en-US",
  KES: "en-KE",
};

export function formatCurrency(amount: Decimal | number | string, currency: "USD" | "KES"): string {
  const numeric = typeof amount === "number" ? amount : Number(amount.toString());
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "KES" ? 0 : 2,
    maximumFractionDigits: currency === "KES" ? 0 : 2,
  }).format(numeric);
}
