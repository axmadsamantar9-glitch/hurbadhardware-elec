'use server'

import { cookies } from 'next/headers'

/**
 * Server action to set locale preference securely (U4).
 * Uses cookies() API with secure flags (HttpOnly, Secure, SameSite).
 * Called from language-switcher component on locale change.
 */
export async function setLocalePreference(locale: string) {
  // Validate locale is one of the supported values
  const supportedLocales = ['en', 'so']
  if (!supportedLocales.includes(locale)) {
    return { error: 'Invalid locale' }
  }

  const cookieStore = await cookies()
  const maxAge = 365 * 24 * 60 * 60 // 1 year

  cookieStore.set('NEXT_LOCALE', locale, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })

  return { success: true }
}
