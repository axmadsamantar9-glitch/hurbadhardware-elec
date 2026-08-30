/**
 * POST /api/admin/uploads/presign — R2 pre-signed product-image upload
 * (HUB-28, U8 media).
 *
 * ADMIN-only. Returns a short-lived pre-signed PUT URL for Cloudflare R2 so
 * the admin browser can upload a product image directly to R2 without the
 * file ever passing through this server. Request body:
 *   { filename: string, contentType: string, sizeBytes: number }
 *
 * Validation order matters: MIME type and declared size are checked and
 * rejected with 400 *before* any R2 client is constructed or any network
 * call is made — an invalid request must never reach R2, even to fail
 * there. Auth (401) and role (403) are checked first of all, before body
 * parsing, matching the layered order request handling generally uses in
 * this codebase (rate limit -> auth -> parse -> business logic).
 *
 * ENVIRONMENT LIMITATION: no live R2 credentials/bucket exist in this dev
 * environment. This route is covered by mock-level unit tests only
 * (route.test.ts) — the S3Client construction and getSignedUrl call are
 * exercised through src/lib/uploads/r2.ts, which is mocked wholesale in
 * tests. There is no live-bucket integration test; that is out of scope
 * here per the HUB-28 task description.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  isAllowedContentType,
  isAllowedUploadSize,
  buildObjectKey,
  createR2Client,
  generatePresignedUploadUrl,
} from "@/lib/uploads/r2";

const PresignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: { message: "Authentication required", code: "unauthorized" } },
        { status: 401 }
      );
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: { message: "Admin access required", code: "forbidden" } },
        { status: 403 }
      );
    }

    // Rate limit per admin user, namespaced so this category can never
    // collide with any other rateLimiter.check() call site in the app (see
    // docs/agents/learnings/storefront.md's rate-limit-key-namespacing rule).
    const { threshold } = getRateLimitConfig("api");
    const rateLimitResult = rateLimiter.check(`admin-uploads:${session.user.id}`, threshold);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: {
            message: "Rate limit exceeded",
            code: "rate_limit_exceeded",
            retryAfter: rateLimitResult.retryAfter,
          },
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfter ?? 60) } }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parseResult = PresignRequestSchema.safeParse(body);
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

    const { contentType, sizeBytes } = parseResult.data;

    if (!isAllowedContentType(contentType)) {
      return NextResponse.json(
        {
          error: {
            message: `Unsupported content type. Allowed: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
            code: "invalid_content_type",
          },
        },
        { status: 400 }
      );
    }

    if (!isAllowedUploadSize(sizeBytes)) {
      return NextResponse.json(
        {
          error: {
            message: `File too large. Maximum size is ${MAX_UPLOAD_BYTES} bytes`,
            code: "file_too_large",
          },
        },
        { status: 400 }
      );
    }

    const bucket = process.env.CLOUDFLARE_R2_BUCKET;
    if (!bucket) {
      logger.error("R2 upload requested but CLOUDFLARE_R2_BUCKET is not configured");
      return NextResponse.json(
        { error: { message: "Upload storage is not configured", code: "internal_error" } },
        { status: 500 }
      );
    }

    const key = buildObjectKey(contentType);
    const client = createR2Client();
    const result = await generatePresignedUploadUrl(client, { bucket, key, contentType });

    logger.info("Admin upload presign issued", {
      userId: session.user.id,
      key: result.key,
      contentType,
      sizeBytes,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    logger.error("Admin upload presign failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: { message: "Failed to generate upload URL", code: "internal_error" } },
      { status: 500 }
    );
  }
}
