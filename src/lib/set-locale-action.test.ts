import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setLocalePreference } from './set-locale-action'

// Mock the cookies function
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { cookies } from 'next/headers'

describe('setLocalePreference Server Action', () => {
  const mockSetFn = vi.fn()
  const mockCookieStore = {
    set: mockSetFn,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetFn.mockClear()

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as never)
  })

  describe('Locale Validation', () => {
    it('should accept valid locale "en"', async () => {
      const result = await setLocalePreference('en')
      expect(result.success).toBe(true)
    })

    it('should accept valid locale "so"', async () => {
      const result = await setLocalePreference('so')
      expect(result.success).toBe(true)
    })

    it('should reject invalid locale "fr"', async () => {
      const result = await setLocalePreference('fr')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject invalid locale "de"', async () => {
      const result = await setLocalePreference('de')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject invalid locale "es"', async () => {
      const result = await setLocalePreference('es')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject empty string', async () => {
      const result = await setLocalePreference('')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject null as string "null"', async () => {
      const result = await setLocalePreference('null')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject mixed case "EN"', async () => {
      const result = await setLocalePreference('EN')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject locale with whitespace " en"', async () => {
      const result = await setLocalePreference(' en')
      expect(result.error).toBe('Invalid locale')
    })

    it('should reject locale with trailing whitespace "en "', async () => {
      const result = await setLocalePreference('en ')
      expect(result.error).toBe('Invalid locale')
    })
  })

  describe('Cookie Setting', () => {
    it('should set NEXT_LOCALE cookie for valid locale "en"', async () => {
      await setLocalePreference('en')

      expect(mockSetFn).toHaveBeenCalledWith(
        'NEXT_LOCALE',
        'en',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
        })
      )
    })

    it('should set NEXT_LOCALE cookie for valid locale "so"', async () => {
      await setLocalePreference('so')

      expect(mockSetFn).toHaveBeenCalledWith(
        'NEXT_LOCALE',
        'so',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
        })
      )
    })

    it('should not set cookie for invalid locale', async () => {
      await setLocalePreference('fr')
      expect(mockSetFn).not.toHaveBeenCalled()
    })

    it('should set cookies to expire in 1 year (365 days)', async () => {
      await setLocalePreference('en')

      const call = mockSetFn.mock.calls[0]
      const options = call[2]
      const maxAgeSeconds = 365 * 24 * 60 * 60
      expect(options.maxAge).toBe(maxAgeSeconds)
    })
  })

  describe('Secure Cookie Flags', () => {
    it('should set HttpOnly flag to true', async () => {
      await setLocalePreference('en')

      const call = mockSetFn.mock.calls[0]
      const options = call[2]
      expect(options.httpOnly).toBe(true)
    })

    it('should set Secure flag to true', async () => {
      await setLocalePreference('en')

      const call = mockSetFn.mock.calls[0]
      const options = call[2]
      expect(options.secure).toBe(true)
    })

    it('should set SameSite to "lax"', async () => {
      await setLocalePreference('en')

      const call = mockSetFn.mock.calls[0]
      const options = call[2]
      expect(options.sameSite).toBe('lax')
    })

    it('should set path to "/"', async () => {
      await setLocalePreference('en')

      const call = mockSetFn.mock.calls[0]
      const options = call[2]
      expect(options.path).toBe('/')
    })

    it('should have all security flags set for "so" locale', async () => {
      await setLocalePreference('so')

      const call = mockSetFn.mock.calls[0]
      const options = call[2]
      expect(options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
      })
    })
  })

  describe('Return Values', () => {
    it('should return { success: true } for valid locale', async () => {
      const result = await setLocalePreference('en')
      expect(result).toEqual({ success: true })
    })

    it('should return { error: string } for invalid locale', async () => {
      const result = await setLocalePreference('invalid')
      expect(result).toHaveProperty('error')
      expect(result.error).toEqual('Invalid locale')
    })

    it('should not have success property when error occurs', async () => {
      const result = await setLocalePreference('fr')
      expect(result).not.toHaveProperty('success')
    })
  })

  describe('Whitelist Enforcement', () => {
    const validLocales = ['en', 'so']
    const invalidLocales = ['fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru']

    validLocales.forEach((locale) => {
      it(`should accept whitelisted locale "${locale}"`, async () => {
        const result = await setLocalePreference(locale)
        expect(result.success).toBe(true)
      })
    })

    invalidLocales.forEach((locale) => {
      it(`should reject non-whitelisted locale "${locale}"`, async () => {
        const result = await setLocalePreference(locale)
        expect(result.error).toBe('Invalid locale')
      })
    })
  })
})
