/**
 * RMA data layer (HUB-43 AC3/AC4/AC5/AC6).
 *
 * Mirrors src/lib/api/warranties.ts's conventions: one ownership-scoped
 * customer read (scoped IN THE WHERE CLAUSE, IDOR-safe, returns null rather
 * than throwing), one unscoped admin search, plus the two mutating
 * operations (create/advance) which always run inside the caller's
 * `prisma.$transaction` so the RmaRequest/RmaStatusHistory/AuditLog rows are
 * written atomically (see src/lib/audit.ts's doc comment).
 */

import type { Prisma, RmaRequest, RmaStatus, ProductCondition } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { isValidRmaTransition } from "@/lib/rma/transitions";

/** Claim statuses (HUB-42's state machine) eligible to trigger RMA creation -- AC3. */
const RMA_ELIGIBLE_CLAIM_STATUSES = ["SERVICE_REPAIR", "REPLACEMENT", "REFUND"] as const;

export class RmaError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "RmaError";
  }
}

/**
 * Creates the RmaRequest for a claim (AC3, manual admin-triggered path).
 * Validates the claim's CURRENT status is RMA-eligible and that no
 * RmaRequest already exists for it (the unique `claimId` DB constraint is
 * the belt-and-suspenders; this proactive check produces a clean error
 * message instead of a raw constraint-violation surfacing to the caller).
 * Always admin-triggered, so `actorId` is required (not nullable).
 */
export async function createRmaForClaim(
  tx: Prisma.TransactionClient,
  claimId: string,
  actorId: string
): Promise<RmaRequest> {
  const claim = await tx.warrantyClaim.findUnique({ where: { id: claimId } });
  if (!claim) {
    throw new RmaError("claim_not_found", "Claim not found");
  }

  if (
    !RMA_ELIGIBLE_CLAIM_STATUSES.includes(
      claim.status as (typeof RMA_ELIGIBLE_CLAIM_STATUSES)[number]
    )
  ) {
    throw new RmaError(
      "claim_not_rma_eligible",
      `Claim status ${claim.status} is not eligible for RMA creation (must be one of ${RMA_ELIGIBLE_CLAIM_STATUSES.join(", ")})`
    );
  }

  const existing = await tx.rmaRequest.findUnique({ where: { claimId } });
  if (existing) {
    throw new RmaError("rma_already_exists", "An RMA already exists for this claim");
  }

  const rma = await tx.rmaRequest.create({
    data: { claimId, status: "REQUESTED" },
  });

  await tx.rmaStatusHistory.create({
    data: { rmaId: rma.id, status: "REQUESTED" },
  });

  await writeAuditLog(tx, {
    actorId,
    action: "rma.create",
    entityType: "rma_request",
    entityId: rma.id,
    after: { claimId, status: rma.status },
  });

  return rma;
}

/** Full detail incl. claim/warranty/order context -- admin-only (no ownership scoping; caller route must be ADMIN-gated). */
export async function getRmaDetailForAdmin(rmaId: string) {
  return db.rmaRequest.findUnique({
    where: { id: rmaId },
    include: {
      history: { orderBy: { createdAt: "asc" } },
      claim: {
        include: {
          warranty: {
            include: {
              user: { select: { id: true, email: true } },
            },
          },
        },
      },
    },
  });
}

export interface SearchRmaFilters {
  claimId?: string;
  orderId?: string;
  customerId?: string;
  customerEmail?: string;
  status?: RmaStatus;
  page?: number;
  pageSize?: number;
}

/** Admin, unscoped search (AC6). Mirrors searchWarranties()'s query-building pattern. */
export async function searchRmaRequests(filters: SearchRmaFilters) {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 25;

  const where: Prisma.RmaRequestWhereInput = {
    ...(filters.claimId ? { claimId: filters.claimId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.orderId ? { claim: { warranty: { orderId: filters.orderId } } } : {}),
    ...(filters.customerId ? { claim: { warranty: { userId: filters.customerId } } } : {}),
    ...(filters.customerEmail
      ? {
          claim: {
            warranty: { user: { email: { contains: filters.customerEmail, mode: "insensitive" } } },
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.rmaRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        claim: {
          include: {
            warranty: {
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    }),
    db.rmaRequest.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

/**
 * Fetch the RMA for a claim, scoped to `userId` IN THE WHERE CLAUSE -- a
 * claim that exists but belongs to someone else, or belongs to the user but
 * has no RMA yet, both return `null` (same IDOR-safety pattern as
 * getWarrantyDetailForUser in src/lib/api/warranties.ts). Never throws for
 * the "doesn't belong to you" case.
 */
export async function getRmaForClaimForUser(userId: string, claimId: string) {
  const claim = await db.warrantyClaim.findFirst({
    where: { id: claimId, warranty: { userId } },
    select: { id: true },
  });
  if (!claim) return null;

  return db.rmaRequest.findUnique({
    where: { claimId },
    include: { history: { orderBy: { createdAt: "asc" } } },
  });
}

export interface AdvanceRmaFields {
  conditionOnReceipt?: ProductCondition;
  inspectionNotes?: string;
}

/**
 * Advances an RMA's status (AC2/AC5/AC6). Validates the transition via
 * isValidRmaTransition (illegal jumps throw RmaError). Sets the matching
 * timestamp per transition:
 *   -> RECEIVED   sets receivedAt
 *   -> INSPECTING sets inspectedAt
 *   -> COMPLETED  (from REPAIR/REPLACE/REFUND) sets completedAt
 * `conditionOnReceipt`/`inspectionNotes` are only meaningful once the RMA has
 * reached RECEIVED or later -- passing either on an earlier transition
 * (REQUESTED->REVIEW, REVIEW->APPROVED/REJECTED, APPROVED->RECEIVED) is
 * rejected so a caller cannot silently persist inspection data that predates
 * the item ever having been received.
 */
export async function advanceRmaStatus(
  tx: Prisma.TransactionClient,
  rmaId: string,
  targetStatus: RmaStatus,
  actorId: string,
  fields?: AdvanceRmaFields
): Promise<RmaRequest> {
  const rma = await tx.rmaRequest.findUnique({ where: { id: rmaId } });
  if (!rma) {
    throw new RmaError("rma_not_found", "RMA not found");
  }

  if (!isValidRmaTransition(rma.status, targetStatus)) {
    throw new RmaError(
      "invalid_transition",
      `Cannot transition RMA from ${rma.status} to ${targetStatus}`
    );
  }

  const hasConditionFields =
    fields?.conditionOnReceipt !== undefined || fields?.inspectionNotes !== undefined;
  const conditionFieldsAllowed =
    targetStatus === "RECEIVED" ||
    targetStatus === "INSPECTING" ||
    targetStatus === "REPAIR" ||
    targetStatus === "REPLACE" ||
    targetStatus === "REFUND" ||
    targetStatus === "COMPLETED";
  if (hasConditionFields && !conditionFieldsAllowed) {
    throw new RmaError(
      "condition_fields_not_allowed",
      "conditionOnReceipt/inspectionNotes can only be set once the RMA has been RECEIVED or later"
    );
  }

  const now = new Date();
  const data: Prisma.RmaRequestUpdateInput = { status: targetStatus };

  if (targetStatus === "RECEIVED") data.receivedAt = now;
  if (targetStatus === "INSPECTING") data.inspectedAt = now;
  if (
    targetStatus === "COMPLETED" &&
    (rma.status === "REPAIR" || rma.status === "REPLACE" || rma.status === "REFUND")
  ) {
    data.completedAt = now;
  }

  if (fields?.conditionOnReceipt !== undefined) data.conditionOnReceipt = fields.conditionOnReceipt;
  if (fields?.inspectionNotes !== undefined) data.inspectionNotes = fields.inspectionNotes;

  const before = { status: rma.status };

  const updated = await tx.rmaRequest.update({ where: { id: rmaId }, data });

  await tx.rmaStatusHistory.create({
    data: { rmaId: updated.id, status: updated.status },
  });

  await writeAuditLog(tx, {
    actorId,
    action: "rma.status_change",
    entityType: "rma_request",
    entityId: updated.id,
    before,
    after: { status: updated.status },
  });

  return updated;
}
