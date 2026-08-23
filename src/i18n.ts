/**
 * next-intl configuration (U4).
 *
 * This module exports the locale configuration used by the middleware
 * and throughout the app. It defines:
 * - Supported locales: 'en', 'so'
 * - Default locale: 'en'
 * - Request configuration for accessing translations and locale info
 */

import { getRequestConfig } from 'next-intl/server'
import enMessages from '@/messages/en.json'
import soMessages from '@/messages/so.json'

export const locales = ['en', 'so'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

const messages = {
  en: enMessages,
  so: soMessages,
}

/**
 * Get the request configuration for next-intl.
 * This is called on the server to get the messages for the current locale.
 * Validates that the requested locale is supported, defaulting to 'en' if not.
 */
export default getRequestConfig(async ({ locale }) => {
  // Explicitly validate locale against supported locales
  const isValidLocale = locale && locales.includes(locale as Locale)
  const resolvedLocale = isValidLocale ? (locale as Locale) : defaultLocale

  return {
    locale: resolvedLocale,
    messages: messages[resolvedLocale],
  }
})
