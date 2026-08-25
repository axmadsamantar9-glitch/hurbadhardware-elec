"use client";

/**
 * Client Component convenience wrapper around `localeField`
 * (src/lib/locale-field.ts, U4 / PRD §U4 L1161).
 *
 * Reads the active locale via `next-intl`'s `useLocale()` so Client
 * Components can resolve a bilingual base field name (e.g. "name") to the
 * concrete Prisma column key (e.g. "nameEn" / "nameSo") without threading
 * the locale through props. Server Components / route handlers should call
 * `localeField(locale, base)` directly instead — it has no hook, so it
 * works outside React's render/hook context too.
 */

import { useLocale } from "next-intl";
import { useMemo } from "react";
import { localeField, type LocaleFieldBase } from "@/lib/locale-field";

export function useLocaleField() {
  const locale = useLocale();

  return useMemo(
    () => ({
      field: <B extends LocaleFieldBase>(base: B) => localeField(locale, base),
    }),
    [locale]
  );
}
