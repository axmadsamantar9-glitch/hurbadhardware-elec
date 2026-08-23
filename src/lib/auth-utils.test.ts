import { describe, it, expect } from 'vitest'
import { isValidEmail, isStrongPassword, hashPassword, verifyPassword } from '@/lib/auth-utils'

describe('auth — validation functions', () => {
  describe('isValidEmail', () => {
    it('accepts valid email with standard format', () => {
      expect(isValidEmail('user@example.com')).toBe(true)
    })

    it('accepts email with subdomain', () => {
      expect(isValidEmail('admin@mail.example.com')).toBe(true)
    })

    it('accepts email with numbers and dots in local part', () => {
      expect(isValidEmail('user.name+tag@example.co.uk')).toBe(true)
    })

    it('rejects email missing @', () => {
      expect(isValidEmail('userexample.com')).toBe(false)
    })

    it('rejects email missing domain', () => {
      expect(isValidEmail('user@')).toBe(false)
    })

    it('rejects email missing local part', () => {
      expect(isValidEmail('@example.com')).toBe(false)
    })

    it('rejects email with spaces', () => {
      expect(isValidEmail('user @example.com')).toBe(false)
      expect(isValidEmail('user@ example.com')).toBe(false)
    })

    it('rejects email with no TLD', () => {
      expect(isValidEmail('user@example')).toBe(false)
    })

    it('rejects empty string', () => {
      expect(isValidEmail('')).toBe(false)
    })

    it('rejects email with multiple @ symbols', () => {
      expect(isValidEmail('user@@example.com')).toBe(false)
    })
  })

  describe('isStrongPassword', () => {
    it('accepts strong password with all requirements', () => {
      expect(isStrongPassword('TestPassword123!')).toBe(true)
    })

    it('accepts strong password with different special characters', () => {
      expect(isStrongPassword('MyP@ss123')).toBe(true)
      expect(isStrongPassword('Pass#word99')).toBe(true)
      expect(isStrongPassword('Secure$Pass1')).toBe(true)
    })

    it('rejects password less than 8 characters', () => {
      expect(isStrongPassword('Test12!')).toBe(false)
      expect(isStrongPassword('Pass1!')).toBe(false)
    })

    it('rejects password without uppercase letter', () => {
      expect(isStrongPassword('testpassword123!')).toBe(false)
    })

    it('rejects password without lowercase letter', () => {
      expect(isStrongPassword('TESTPASSWORD123!')).toBe(false)
    })

    it('rejects password without number', () => {
      expect(isStrongPassword('TestPassword!')).toBe(false)
    })

    it('rejects password without special character', () => {
      expect(isStrongPassword('TestPassword123')).toBe(false)
    })

    it('accepts password with exactly 8 characters if it meets all requirements', () => {
      expect(isStrongPassword('Pass123!')).toBe(true)
    })

    it('rejects password with 7 characters even if it meets other requirements', () => {
      expect(isStrongPassword('Pass12!')).toBe(false)
    })

    it('accepts longer passwords with all requirements', () => {
      expect(isStrongPassword('VeryLongPasswordWithNumber123AndSpecial!')).toBe(true)
    })

    it('rejects empty string', () => {
      expect(isStrongPassword('')).toBe(false)
    })
  })

  describe('password hashing and verification', () => {
    it('hashes password and produces different output each time (bcrypt salt)', async () => {
      const password = 'TestPassword123!'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)
      
      expect(hash1).not.toBe(hash2) // Different due to random salt
      expect(hash1).toMatch(/^\$2[aby]\$/) // bcrypt format
      expect(hash2).toMatch(/^\$2[aby]\$/) // bcrypt format
    })

    it('verifies correct password against hash', async () => {
      const password = 'TestPassword123!'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword(password, hash)
      
      expect(isValid).toBe(true)
    })

    it('rejects wrong password against hash', async () => {
      const password = 'TestPassword123!'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword('WrongPassword123!', hash)
      
      expect(isValid).toBe(false)
    })

    it('rejects empty password against hash', async () => {
      const password = 'TestPassword123!'
      const hash = await hashPassword(password)
      const isValid = await verifyPassword('', hash)
      
      expect(isValid).toBe(false)
    })

    it('handles bcrypt cost 12 (default)', async () => {
      const password = 'TestPassword123!'
      const hash = await hashPassword(password)
      
      // bcrypt hash format: $2a$cost$...
      const costMatch = hash.match(/\$2[aby]\$(\d{2})\$/)
      expect(costMatch).not.toBeNull()
      expect(costMatch?.[1]).toBe('12')
    })
  })
})
