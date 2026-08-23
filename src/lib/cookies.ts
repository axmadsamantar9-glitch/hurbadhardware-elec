import type { NextResponse } from 'next/server'

// The Secure/HttpOnly/SameSite convention every future cookie-setting call
// must go through (PRD §9.1's "secure cookies" requirement). Established
// here ahead of the auth work that will actually call it — no session or
// auth cookie exists yet.
interface SetCookieOptions {
  maxAge?: number
  path?: string
}

export function setSecureCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: SetCookieOptions = {}
): void {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: options.path ?? '/',
    maxAge: options.maxAge,
  })
}
