import { describe, expect, it, vi, beforeEach } from 'vitest'
import { writeAuditLog, writeOverrideAuditLog } from './audit'
import type { PrismaClient } from '@prisma/client'

// Mock the dependencies
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports writeAuditLog function', () => {
    expect(typeof writeAuditLog).toBe('function')
  })

  it('exports writeOverrideAuditLog function', () => {
    expect(typeof writeOverrideAuditLog).toBe('function')
  })

  it('writeAuditLog accepts transaction client and entry', async () => {
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: '1' }),
      },
    } as unknown as PrismaClient

    const entry = {
      actorId: 'user-123',
      action: 'product.update',
      entityType: 'Product',
      entityId: 'prod-456',
      correlationId: 'req-789',
    }

    await writeAuditLog(mockTx, entry)

    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'user-123',
          action: 'product.update',
          entityType: 'Product',
          entityId: 'prod-456',
          correlationId: 'req-789',
        }),
      })
    )
  })

  it('writeAuditLog passes through before/after snapshots', async () => {
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: '1' }),
      },
    } as unknown as PrismaClient

    const entry = {
      actorId: 'user-123',
      action: 'product.update',
      entityType: 'Product',
      entityId: 'prod-456',
      before: { price: 100 },
      after: { price: 150 },
    }

    await writeAuditLog(mockTx, entry)

    const callArgs = (mockTx.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: { before: unknown; after: unknown } }
    expect(callArgs.data.before).toEqual({ price: 100 })
    expect(callArgs.data.after).toEqual({ price: 150 })
  })

  it('writeOverrideAuditLog requires actorId and reason', async () => {
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: '1' }),
      },
    } as unknown as PrismaClient

    const entry = {
      actorId: 'user-123',
      action: 'warranty.override',
      entityType: 'Warranty',
      entityId: 'war-456',
      reason: 'Customer escalation',
      correlationId: 'req-789',
    }

    await writeOverrideAuditLog(mockTx, entry)

    const callArgs = (mockTx.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: { actorId: string; reason: string } }
    expect(callArgs.data.actorId).toBe('user-123')
    expect(callArgs.data.reason).toBe('Customer escalation')
  })

  it('logs audit write to logger with correlation ID', async () => {
    const { logger } = await import('./logger')
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: '1' }),
      },
    } as unknown as PrismaClient

    const entry = {
      actorId: 'user-123',
      action: 'product.create',
      entityType: 'Product',
      entityId: 'prod-new',
      correlationId: 'req-789',
    }

    await writeAuditLog(mockTx, entry)

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      'audit.write',
      expect.objectContaining({
        correlationId: 'req-789',
        action: 'product.create',
      })
    )
  })

  it('handles null actorId for system-generated actions', async () => {
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: '1' }),
      },
    } as unknown as PrismaClient

    const entry = {
      actorId: null,
      action: 'inventory.adjust',
      entityType: 'Inventory',
      entityId: 'inv-789',
    }

    await writeAuditLog(mockTx, entry)

    const callArgs = (mockTx.auditLog.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: { actorId: null } }
    expect(callArgs.data.actorId).toBeNull()
  })
})
