/**
 * Soft-delete workflow for User accounts (HUR-172 privacy guidelines,
 * docs/guidelines/privacy-and-data.md AC11/AC14).
 *
 * Design:
 * - This is the only application-code path that anonymizes a user's PII.
 *   Callers (self-service "delete my account" action, admin deletion action)
 *   must run this inside their own `prisma.$transaction`, passing that
 *   transaction's client as `tx` — same convention as src/lib/audit.ts —
 *   so the anonymization and its audit row either both commit or neither do.
 * - Sets `deletedAt = now()` and nullifies `email`/`phone`/`name` on the User
 *   row per AC11 step 2. `id`, `role`, and `createdAt` are preserved for
 *   audit/reporting continuity.
 * - Address rows are a separate related model (not a field on User) and most
 *   of their PII columns are non-nullable in the schema, so they cannot be
 *   set to `null`; they are overwritten with a `"[deleted]"` placeholder
 *   instead, which achieves the same anonymization intent without a schema
 *   change (out of scope for this issue).
 * - Deletes DB-tracked session rows only (AC11 step 5); does NOT revoke
 *   active JWT session cookies under this app's `session.strategy: "jwt"`
 *   — see the known-limitation note above the `tx.session.deleteMany` call
 *   below for what a future caller must do to close this gap.
 * - Writes an audit entry via `writePaymentAuditLog`, which redacts PII from
 *   the before/after snapshots (via src/lib/redact.ts) before it is written
 *   to the audit_logs row or logged — the deletion action itself is
 *   deliberately NOT logged with plaintext PII, even though other audit
 *   flows in this codebase keep PII in audit snapshots by design.
 * - Idempotent: calling this again on an already-deleted user is a no-op
 *   that does not re-anonymize or re-audit.
 *
 * Callers are responsible for applying the `WHERE deletedAt IS NULL`
 * convention documented in {@link ACTIVE_USER_FILTER} to any query that
 * should exclude soft-deleted users.
 */

import type { Prisma } from "@prisma/client";
import { writePaymentAuditLog } from "@/lib/audit";

const DELETED_PLACEHOLDER = "[deleted]";

export interface SoftDeleteUserParams {
  /** ID of the user being deleted. */
  userId: string;
  /** Actor performing the deletion: the user themselves, or an admin ID. */
  actorId: string | null;
  /** Required per AC14 ("reason required" for admin deletion; self-service
   * deletion should pass a fixed reason like "Customer-initiated deletion"). */
  reason: string;
  correlationId?: string;
}

export interface SoftDeleteUserResult {
  id: string;
  deletedAt: Date;
  /** True if this call performed the deletion; false if the user was
   * already soft-deleted and this call was a no-op. */
  didDelete: boolean;
}

/**
 * Convention for active-user queries: merge this into a `where` clause so
 * soft-deleted users are excluded, e.g.
 * `db.user.findMany({ where: { ...ACTIVE_USER_FILTER, role: "CUSTOMER" } })`.
 */
export const ACTIVE_USER_FILTER = { deletedAt: null } as const;

/**
 * Pure predicate used by src/auth.ts's Credentials `authorize()` sign-in flow
 * to reject soft-deleted users. Extracted so it's unit-testable without
 * importing auth.ts (which cannot load in the Vitest Node environment — see
 * docs/agents/learnings/qa-test.md, "NextAuth Logic Tests via Extracted
 * Utilities").
 */
export function isSoftDeleted(user: { deletedAt: Date | null } | null | undefined): boolean {
  return Boolean(user?.deletedAt);
}

/**
 * Soft-deletes a user: anonymizes PII, sets deletedAt, deletes DB-tracked
 * session rows (does NOT revoke active JWT cookies — see known-limitation
 * note below), and writes a PII-redacted audit entry. Must run inside a
 * transaction (pass its `Prisma.TransactionClient` as `tx`).
 *
 * Returns null if no user with the given ID exists.
 */
export async function softDeleteUser(
  tx: Prisma.TransactionClient,
  params: SoftDeleteUserParams
): Promise<SoftDeleteUserResult | null> {
  const { userId, actorId, reason, correlationId } = params;

  const existing = await tx.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return null;
  }

  // Idempotent no-op: never re-anonymize or re-audit an already-deleted user.
  if (existing.deletedAt) {
    return { id: existing.id, deletedAt: existing.deletedAt, didDelete: false };
  }

  const deletedAt = new Date();

  const updated = await tx.user.update({
    where: { id: userId },
    data: {
      email: null,
      phone: null,
      name: null,
      deletedAt,
    },
  });

  // Anonymize this user's saved addresses (separate model; non-nullable PII
  // columns get a placeholder rather than null — see module doc comment).
  await tx.address.updateMany({
    where: { userId },
    data: {
      fullName: DELETED_PLACEHOLDER,
      phone: DELETED_PLACEHOLDER,
      addressLine1: DELETED_PLACEHOLDER,
      addressLine2: null,
      city: DELETED_PLACEHOLDER,
      state: null,
    },
  });

  // Deletes DB-tracked session rows (OAuth account-linking bookkeeping only).
  // KNOWN LIMITATION: this app uses session.strategy: "jwt" (see src/auth.ts),
  // under which NextAuth validates sessions purely from the signed JWT cookie
  // and never queries the `sessions` table per request. Deleting these rows
  // has NO effect on already-issued JWT session cookies — a soft-deleted
  // user's existing browser session remains valid until JWT expiry (session
  // maxAge), since re-verification only happens at fresh sign-in via
  // authorize(). Before wiring a delete-account or admin-delete route to this
  // function, add a `deletedAt` check to the NextAuth `jwt` or `session`
  // callback (re-validate against the DB), or switch to
  // session.strategy: "database", so that soft-deletion actually revokes an
  // active session — this is not yet implemented.
  await tx.session.deleteMany({ where: { userId } });

  // Audit entry with PII-redacted before/after snapshots — writePaymentAuditLog
  // runs both through src/lib/redact.ts before they reach the audit_logs row
  // or the structured logger, so the deletion is traceable without leaking
  // plaintext PII (per this issue's explicit requirement).
  await writePaymentAuditLog(tx, {
    actorId,
    action: "user.delete",
    entityType: "User",
    entityId: userId,
    before: { email: existing.email, name: existing.name, phone: existing.phone },
    after: { email: updated.email, name: updated.name, phone: updated.phone, deletedAt },
    reason,
    correlationId,
  });

  return { id: updated.id, deletedAt, didDelete: true };
}
