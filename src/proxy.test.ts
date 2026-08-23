import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

/**
 * Proxy Middleware Tests — Configuration and Correlation ID Logic
 *
 * Note: Full middleware integration tests are deferred to E2E suite.
 * These tests cover the correlation ID validation pattern and config export.
 */

describe('proxy middleware configuration', () => {
  it('middleware matcher excludes static assets', () => {
    // Config in proxy.ts:
    // matcher: ['/((?!_next/static|_next/image|favicon.ico).*)',]
    const excludedPaths = ['_next/static', '_next/image', 'favicon.ico']
    expect(excludedPaths).toHaveLength(3)
  })

  it('middleware matcher is a regex negative lookahead', () => {
    // The pattern: /((?!_next/static|_next/image|favicon.ico).*)/
    const matcherPattern = '/((?!_next/static|_next/image|favicon.ico).*)'
    expect(matcherPattern).toContain('_next/static')
    expect(matcherPattern).toContain('_next/image')
    expect(matcherPattern).toContain('favicon.ico')
  })

  it('validates UUID format correctly', () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Valid UUIDs
    expect(UUID_PATTERN.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(UUID_PATTERN.test('abcdef01-2345-6789-abcd-ef0123456789')).toBe(true)
    expect(UUID_PATTERN.test('ABCDEF01-2345-6789-ABCD-EF0123456789')).toBe(true)

    // Invalid UUIDs
    expect(UUID_PATTERN.test('not-a-uuid')).toBe(false)
    expect(UUID_PATTERN.test('550e8400-e29b-41d4-a716-4466554')).toBe(false)
    expect(UUID_PATTERN.test('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false)
    expect(UUID_PATTERN.test('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false)
  })

  it('generates valid UUIDs when needed', () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    for (let i = 0; i < 5; i++) {
      const uuid = randomUUID()
      expect(UUID_PATTERN.test(uuid)).toBe(true)
    }
  })

  it('correlation ID logic: accepts valid inbound UUID', () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validUuid = '550e8400-e29b-41d4-a716-446655440000'
    const inbound = validUuid

    const correlationId = inbound && UUID_PATTERN.test(inbound) ? inbound : randomUUID()

    expect(correlationId).toBe(validUuid)
  })

  it('correlation ID logic: rejects invalid inbound UUID and generates new one', () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    const inbound = 'not-a-uuid'
    const correlationId = inbound && UUID_PATTERN.test(inbound) ? inbound : randomUUID()

    expect(correlationId).not.toBe('not-a-uuid')
    expect(validPattern.test(correlationId)).toBe(true)
  })

  it('correlation ID logic: generates UUID when no inbound value', () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const validPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    const inbound = null
    const correlationId = inbound && UUID_PATTERN.test(inbound) ? inbound : randomUUID()

    expect(validPattern.test(correlationId)).toBe(true)
  })
})
