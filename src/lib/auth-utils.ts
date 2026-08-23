/**
 * Authentication utility functions (testable, no NextAuth dependencies)
 *
 * These functions handle password/email validation and hashing.
 */

import { hash, compare } from 'bcryptjs'

/**
 * Validate email format (RFC 5321 simplified).
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate password strength: ≥8 chars, mix of upper/lower/number/special.
 */
export function isStrongPassword(password: string): boolean {
  if (password.length < 8) return false
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\|,.<>?]/.test(password)
  return hasUpper && hasLower && hasNumber && hasSpecial
}

/**
 * Hash a plaintext password with bcrypt (cost 12).
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12)
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(plaintext: string, hashValue: string): Promise<boolean> {
  return compare(plaintext, hashValue)
}
