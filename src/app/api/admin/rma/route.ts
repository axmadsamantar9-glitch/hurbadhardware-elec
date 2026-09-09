/**
 * POST /api/admin/rma -- creates an RmaRequest for a claim (HUB-43 AC3,
 * manual admin-triggered path). GET /api/admin/rma -- search (AC6). Both
 * ADMIN-only, same auth pattern as src/app/api/admin/warranties/route.ts /
 * src/app/api/admin/warranties/register/route.ts.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { createRmaForClaim, searchRmaRequests, RmaError } from "@/lib/rma/api";
import type { RmaStatus } from "@prisma/client";

const VALID_STATUSES: RmaStatus[] = [
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
];

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

export async function GET(request: Request): Promise<NextResponse> {
  const auth_ = await requireAdmin();
  if (!auth_.ok) return auth_.response;

  try {
    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(`admin-rma-search:${auth_.userId}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam && VALID_STATUSES.includes(statusParam as RmaStatus)
        ? (statusParam as RmaStatus)
        : undefined;

    const result = await searchRmaRequests({
      claimId: url.searchParams.get("claimId") ?? undefined,
      orderId: url.searchParams.get("orderId") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      customerEmail: url.searchParams.get("customerEmail") ?? undefined,
      status,
      page: Number(url.searchParams.get("page") ?? "1"),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    logger.error("admin_rma_search_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to search RMAs", code: "internal_error" } },
      { status: 500 }
    );
  }
}

const CreateRmaSchema = z.object({
  claimId: z.string().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const auth_ = await requireAdmin();
  if (!auth_.ok) return auth_.response;

  try {
    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(`admin-rma-create:${auth_.userId}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parseResult = CreateRmaSchema.safeParse(body);
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

    const result = await db.$transaction(async (tx) => {
      const rma = await createRmaForClaim(tx, parseResult.data.claimId, auth_.userId);
      return rma;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof RmaError) {
      const status = error.code === "claim_not_found" ? 404 : 400;
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status });
    }
    // A concurrent request for the same claim can pass the app-level
    // existing-RMA check before either commits (TOCTOU) -- the DB's unique
    // constraint on rma_requests.claim_id is the real backstop and rejects
    // the second insert. Map that specific case to a clean 409 instead of a
    // generic 500 (security-reviewer finding, HUB-43 -- data integrity was
    // already sound, this is purely a response-shape improvement).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | undefined)?.includes("claim_id")
    ) {
      return NextResponse.json(
        { error: { message: "An RMA already exists for this claim", code: "rma_already_exists" } },
        { status: 409 }
      );
    }
    logger.error("admin_rma_create_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to create RMA", code: "internal_error" } },
      { status: 500 }
    );
  }
}
