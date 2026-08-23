import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'

// Naming convention every caller follows: `<entity>.<verb>`, e.g.
// `product.update`, `order.status_change`, `payment.refund`,
// `warranty.override`, `inventory.adjust`, `user.role_change`.

interface AuditEntryBase {
  actorId: string | null
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  correlationId?: string
}

interface AuditEntry extends AuditEntryBase {
  reason?: string | null
}

interface OverrideAuditEntry extends AuditEntryBase {
  /// Required, not optional — PRD §6.9: "Overrides require a reason, actor
  /// and audit record." A caller cannot construct this call without both.
  actorId: string
  reason: string
}

async function insertAuditRow(
  tx: Prisma.TransactionClient,
  entry: AuditEntryBase & { reason?: string | null }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before !== undefined
        ? { before: entry.before as Prisma.InputJsonValue }
        : {}),
      ...(entry.after !== undefined ? { after: entry.after as Prisma.InputJsonValue } : {}),
      reason: entry.reason ?? null,
      correlationId: entry.correlationId ?? null,
    },
  })

  // Same correlation ID as the DB row, so a request is traceable across both
  // the durable audit trail and the transient structured-log stream. Reuses
  // [012]'s logger, which already redacts secret-shaped fields/values — it
  // does not redact PII, which audit before/after snapshots deliberately keep.
  logger.info('audit.write', {
    correlationId: entry.correlationId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
  })
}

/**
 * Records a sensitive action. Must run inside the same `prisma.$transaction`
 * as the action it describes — pass that transaction's client as `tx`, never
 * the global `db` from src/lib/db.ts — so a failed action can never leave an
 * orphaned audit row, and a successful one can never complete without one
 * (PRD §9.3; issue [013]).
 *
 * This is the only way application code writes an audit row. There is
 * deliberately no exported update or delete function — append-only is
 * enforced here at the application layer, and again at the database layer by
 * prisma/migrations/manual/002_audit_log_append_only.sql.
 */
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  entry: AuditEntry
): Promise<void> {
  await insertAuditRow(tx, entry)
}

/**
 * Records an override-type action (e.g. approving an expired warranty).
 * Identical to writeAuditLog except `reason` and `actorId` are required at
 * the type level, so a caller cannot even construct a call that omits either.
 */
export async function writeOverrideAuditLog(
  tx: Prisma.TransactionClient,
  entry: OverrideAuditEntry
): Promise<void> {
  await insertAuditRow(tx, entry)
}
