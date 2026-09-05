/**
 * POST /api/track -- public (no auth) order lookup by last-4-of-order-id +
 * email (HUB-39, U14 / PRD R14, AC5).
 *
 * Trust boundary: this is the one order-reading endpoint that requires NO
 * session, so it is the highest-risk surface for enumeration/brute-force.
 * Mitigations, in order:
 *   1. Dual independent rate limits (`track:ip:<ip>` AND `track:suffix:<sfx>`)
 *      -- both must pass, so neither a single IP hammering many suffixes nor
 *      many IPs hammering one suffix can bypass the limit (Iron Rule #8).
 *   2. Zero matches for ANY reason (bad suffix, suffix found but email
 *      doesn't match, no linked user/email at all) all return the exact same
 *      generic `404 { error: "not_found" }` -- never a different message or
 *      status for "wrong email" vs "no such order", so this can never be
 *      used as an email/order-existence oracle.
 *   3. The success response never echoes the submitted email back, and omits
 *      shipping address / payment method / per-item unit price entirely
 *      (Iron Rule #6) -- see src/lib/api/orders.ts's trackOrder() for the
 *      exact reduced shape.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { rateLimiter, getClientIP } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { trackOrder } from "@/lib/api/orders";

const TrackRequestSchema = z.object({
  orderIdSuffix: z.string().min(1).max(64),
  email: z.string().min(1).max(255),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parseResult = TrackRequestSchema.safeParse(body);
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

    const normalizedSuffix = parseResult.data.orderIdSuffix.trim().toLowerCase();
    const normalizedEmail = parseResult.data.email.trim().toLowerCase();

    const { threshold } = getRateLimitConfig("track");
    const ipResult = rateLimiter.check(`track:ip:${getClientIP(request)}`, threshold);
    const suffixResult = rateLimiter.check(`track:suffix:${normalizedSuffix}`, threshold);

    if (!ipResult.allowed || !suffixResult.allowed) {
      const retryAfter = Math.max(ipResult.retryAfter ?? 0, suffixResult.retryAfter ?? 0) || 60;
      return NextResponse.json(
        {
          error: {
            message: "Rate limit exceeded",
            code: "rate_limit_exceeded",
            retryAfter,
          },
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const result = await trackOrder(normalizedSuffix, normalizedEmail);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        id: result.id,
        status: result.status,
        trackingNumber: result.trackingNumber,
        items: result.items,
        statusHistory: result.statusHistory,
        totals: result.totals,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Order tracking lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to look up order", code: "internal_error" } },
      { status: 500 }
    );
  }
}
