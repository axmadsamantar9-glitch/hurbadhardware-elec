/**
 * GET/PATCH /api/admin/rma/[id] -- RMA detail + status advancement (HUB-43
 * AC6). ADMIN-only, same auth/rate-limit/Zod pattern as
 * src/app/api/admin/warranties/claims/[id]/route.ts. No override concept
 * for RMA (architect determined none is needed) -- PATCH here never accepts
 * an override reason, unlike the claim route.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { getRmaDetailForAdmin, advanceRmaStatus, RmaError } from "@/lib/rma/api";

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
    const rma = await getRmaDetailForAdmin(id);
    if (!rma) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(rma, { status: 200 });
  } catch (error: unknown) {
    logger.error("admin_rma_get_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to load RMA", code: "internal_error" } },
      { status: 500 }
    );
  }
}

const PatchRmaSchema = z.object({
  status: z.enum([
    "REQUESTED",
    "REVIEW",
    "APPROVED",
    "REJECTED",
    "RECEIVED",
    "INSPECTING",
    "REPAIR",
    "REPLACE",
    "REFUND",
    "COMPLETED",
  ]),
  conditionOnReceipt: z.enum(["NEW", "OPEN_BOX", "REFURBISHED", "USED"]).optional(),
  // .trim() before .min() so a whitespace-only note can't be persisted as
  // meaningful content (same convention as overrideReason in
  // src/app/api/admin/warranties/claims/[id]/route.ts).
  inspectionNotes: z.string().trim().min(1).max(2000).optional(),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const auth_ = await requireAdmin();
  if (!auth_.ok) return auth_.response;

  try {
    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(`admin-rma-patch:${auth_.userId}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const { id } = await params;

    const body: unknown = await request.json().catch(() => null);
    const parseResult = PatchRmaSchema.safeParse(body);
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

    const updated = await db.$transaction(async (tx) => {
      return advanceRmaStatus(tx, id, parseResult.data.status, auth_.userId, {
        conditionOnReceipt: parseResult.data.conditionOnReceipt,
        inspectionNotes: parseResult.data.inspectionNotes,
      });
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof RmaError) {
      const status = error.code === "rma_not_found" ? 404 : 400;
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status });
    }
    logger.error("admin_rma_patch_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to update RMA", code: "internal_error" } },
      { status: 500 }
    );
  }
}
