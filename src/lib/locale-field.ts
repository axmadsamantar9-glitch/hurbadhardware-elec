/**
 * Locale-aware Prisma field selection (U4, PRD §U4 L1161).
 *
 * The schema stores bilingual content as separate `<base>En`/`<base>So`
 * columns rather than a single localized column (see prisma/schema.prisma —
 * Category.nameEn/nameSo, Product.nameEn/nameSo/descriptionEn/descriptionSo,
 * ProductImage.altEn/altSo, ProductSpec.keyEn/keySo/valueEn/valueSo,
 * OrderItem.nameSnapshotEn/nameSnapshotSo). This module maps a "base" field
 * name plus the current locale to the concrete Prisma column key so callers
 * never hand-roll `locale === "so" ? "nameSo" : "nameEn"` at every call site.
 *
 * Implemented as a plain function (not a hook) because it needs to work
 * equally in Server Components / Route Handlers / server actions (no React
 * hook context, no `next-intl` client provider) and in Client Components.
 * Both contexts already have the current locale available through different
 * APIs — `next-intl`'s server-side `getLocale()`/route param in the former,
 * `useLocale()` in the latter — so this function takes the locale as an
 * explicit parameter instead of reading it internally. A thin
 * `useLocaleField` React hook (src/hooks/use-locale-field.ts) wraps this for
 * Client Components that want the ergonomics of not passing the locale
 * themselves.
 */

import type { Locale } from "@/i18n";
import { locales, defaultLocale } from "@/i18n";

/** Every `<base>En` / `<base>So` field pair currently in the schema. */
export const LOCALE_FIELD_BASES = [
  "name",
  "description",
  "alt",
  "key",
  "value",
  "nameSnapshot",
] as const;

export type LocaleFieldBase = (typeof LOCALE_FIELD_BASES)[number];

type LocaleFieldMap<B extends string> = `${B}En` | `${B}So`;

/**
 * Resolve `base` (e.g. "name") to the locale-specific Prisma column key
 * (e.g. "nameEn" / "nameSo") for the given locale. Any locale value that
 * isn't in the supported `locales` list — including `undefined`, empty
 * string, or an unrecognized code — falls back to `defaultLocale` ("en").
 */
export function localeField<B extends LocaleFieldBase>(
  locale: string | null | undefined,
  base: B
): LocaleFieldMap<B> {
  const resolved: Locale =
    locale && locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;

  return `${base}${resolved === "en" ? "En" : "So"}` as LocaleFieldMap<B>;
}
