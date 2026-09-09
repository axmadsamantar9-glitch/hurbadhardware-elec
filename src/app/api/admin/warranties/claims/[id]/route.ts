/**
 * GET/PATCH /api/admin/warranties/claims/[id] -- claim detail + state
 * transitions (HUB-42 AC6/AC7). ADMIN-only, same auth pattern as
 * src/app/api/admin/payments/route.ts.
 *
 * PATCH validates the requested transition via isValidClaimTransition (400
 * on illegal jump). AC7: if the claim's warranty is NOT currently ACTIVE
 * (EXPIRED/VOID/NOT_COVERED, computed live via calculateWarrantyStatus --
 * never trusting a possibly-stale persisted column) and the requested
 * transition is an approval/advance (i.e. anything other than REJECTED or
 * CLOSED, which are decline/terminal paths that grant nothing new), the
 * request body MUST include `overrideReason`. When present, `isOverride` is
 * set true and a "warranty.override" AuditLog row is written via
 * src/lib/audit.ts's writeOverrideAuditLog, inside the same transaction as
 * the claim update.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { isValidClaimTransition } from "@/lib/warranty/claim-transitions";
import { calculateWarrantyStatus } from "@/lib/warranty/status";
import { writeAuditLog, writeOverrideAuditLog } from "@/lib/audit";
import type { WarrantyClaimStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      ),
    };
  }
  if (session.user.role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Admin access required", code: "forbidden" } },
        { status: 403 }
      ),
    };
  }
  return { ok: true, userId: session.user.id };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const auth_ = await requireAdmin();
  if (!auth_.ok) return auth_.response;

  try {
    const { id } = await params;
    const claim = await db.warrantyClaim.findUnique({
      where: { id },
      include: { warranty: true, messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!claim) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(claim, { status: 200 });
  } catch (error: unknown) {
    logger.error("admin_warranty_claim_get_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to load claim", code: "internal_error" } },
      { status: 500 }
    );
  }
}

const PatchClaimSchema = z.object({
  status: z.enum([
    "REQUESTED",
    "ELIGIBILITY_REVIEW",
    "APPROVED",
    "REJECTED",
    "TROUBLESHOOTING",
    "SERVICE_REPAIR",
    "REPLACEMENT",
    "REFUND",
    "COMPLETED",
    "CLOSED",
  ]),
  // .trim() before .min() so a whitespace-only reason (e.g. " ") can't
  // satisfy the length check and get persisted as a meaningless audit
  // justification (security-reviewer finding, HUB-42).
  overrideReason: z.string().trim().min(1).max(1000).optional(),
});

/** Decline/terminal transitions never "approve or advance" claim benefit, so AC7's override requirement doesn't apply to them. */
const NON_APPROVAL_TRANSITIONS: WarrantyClaimStatus[] = ["REJECTED", "CLOSED"];

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const auth_ = await requireAdmin();
  if (!auth_.ok) return auth_.response;

  try {
    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(
      `admin-warranty-claim-patch:${auth_.userId}`,
      threshold
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const { id } = await params;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = PatchClaimSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: {
            message: "Invalid request body",
            code: "validation_error",
            issues: parseResult.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const claim = await db.warrantyClaim.findUnique({
      where: { id },
      include: { warranty: true },
    });
    if (!claim) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const targetStatus = parseResult.data.status;

    if (!isValidClaimTransition(claim.status, targetStatus)) {
      return NextResponse.json(
        {
          error: {
            message: `Cannot transition claim from ${claim.status} to ${targetStatus}`,
            code: "invalid_transition",
          },
        },
        { status: 400 }
      );
    }

    const warrantyStatus = calculateWarrantyStatus({
      warrantyMonths: claim.warranty.warrantyMonthsSnapshot,
      startDate: claim.warranty.startDate,
      voidedAt: claim.warranty.voidedAt,
    });

    const isApprovalOrAdvance = !NON_APPROVAL_TRANSITIONS.includes(targetStatus);
    const requiresOverride = warrantyStatus !== "ACTIVE" && isApprovalOrAdvance;

    if (requiresOverride && !parseResult.data.overrideReason) {
      return NextResponse.json(
        {
          error: {
            message:
              "This warranty is not currently ACTIVE -- overrideReason is required to advance this claim",
            code: "override_reason_required",
          },
        },
        { status: 400 }
      );
    }

    const overrideReason = parseResult.data.overrideReason;

    const updated = await db.$transaction(async (tx) => {
      const before = { status: claim.status, isOverride: claim.isOverride };

      const result = await tx.warrantyClaim.update({
        where: { id: claim.id },
        data: {
          status: targetStatus,
          ...(overrideReason ? { isOverride: true } : {}),
          ...(targetStatus === "CLOSED" ? { closedAt: new Date() } : {}),
        },
      });

      await writeAuditLog(tx, {
        actorId: auth_.userId,
        action: "warranty_claim.status_change",
        entityType: "warranty_claim",
        entityId: claim.id,
        before,
        after: { status: result.status, isOverride: result.isOverride },
      });

      if (overrideReason) {
        await writeOverrideAuditLog(tx, {
          actorId: auth_.userId,
          action: "warranty.override",
          entityType: "warranty_claim",
          entityId: claim.id,
          reason: overrideReason,
        });
      }

      return result;
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error: unknown) {
    logger.error("admin_warranty_claim_patch_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to update claim", code: "internal_error" } },
      { status: 500 }
    );
  }
}
