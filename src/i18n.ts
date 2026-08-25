/**
 * next-intl configuration (U4).
 *
 * This module exports the locale configuration used by the middleware
 * and throughout the app. It defines:
 * - Supported locales: 'en', 'so'
 * - Default locale: 'en'
 * - Request configuration for accessing translations and locale info
 */

import { getRequestConfig } from "next-intl/server";
import enMessages from "@/messages/en.json";
import soMessages from "@/messages/so.json";

export const locales = ["en", "so"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

type MessageTree = { [key: string]: string | MessageTree };

/**
 * Recursively merge `override` onto `base`, keeping `base`'s value for any
 * key `override` doesn't define. Used so a translation key missing from a
 * non-English locale's message file falls back to the English string at
 * runtime instead of next-intl's default MISSING_MESSAGE behavior (which
 * renders the dotted key path, not readable text). Key parity between
 * en.json/so.json is still enforced by tests — this is defense-in-depth for
 * the moment a key is added to one file and not (yet) the other.
 */
export function mergeMessagesWithFallback(base: MessageTree, override: MessageTree): MessageTree {
  const result: MessageTree = { ...base };

  for (const key of Object.keys(override)) {
    const baseValue = base[key];
    const overrideValue = override[key];

    if (
      typeof overrideValue === "object" &&
      overrideValue !== null &&
      typeof baseValue === "object" &&
      baseValue !== null
    ) {
      result[key] = mergeMessagesWithFallback(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }

  return result;
}

const messages = {
  en: enMessages,
  // `so` is deep-merged onto `en` so any key present in en.json but not (yet)
  // in so.json resolves to the English string rather than an error/blank.
  so: mergeMessagesWithFallback(enMessages, soMessages),
};

/**
 * Get the request configuration for next-intl.
 * This is called on the server to get the messages for the current locale.
 * Validates that the requested locale is supported, defaulting to 'en' if not.
 */
export default getRequestConfig(async ({ locale }) => {
  // Explicitly validate locale against supported locales
  const isValidLocale = locale && locales.includes(locale as Locale);
  const resolvedLocale = isValidLocale ? (locale as Locale) : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: messages[resolvedLocale],
  };
});
