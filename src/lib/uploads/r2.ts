/**
 * Cloudflare R2 pre-signed-upload helper (HUB-28, U8 media).
 *
 * R2 exposes an S3-compatible API, so uploads are pre-signed with the
 * standard AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
 * pointed at R2's account-scoped S3 endpoint, rather than a Cloudflare-
 * specific SDK. The route handler that consumes this module
 * (src/app/api/admin/uploads/presign/route.ts) validates the requested
 * content type and declared size against the constants exported here
 * *before* ever calling createR2Client()/generatePresignedUploadUrl() —
 * validation must never depend on live R2 credentials being present.
 *
 * `createR2Client()` is a plain factory (not a module-level singleton) so
 * tests can call the route without ever constructing a real S3Client — the
 * route handler only calls it after validation has already passed, and unit
 * tests instead mock this whole module and assert on the call shape, never
 * exercising the real network client. No live R2 bucket exists in this dev
 * environment; see compatibility.test.ts-style unit coverage in
 * route.test.ts for what IS verified here, and the route's own doc comment
 * for the explicit "no live-bucket integration test" limitation.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

/** Images only — matches what Cloudflare Images accepts for direct upload. */
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** 10MB, matching the ticket's declared-size ceiling. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** How long a pre-signed PUT URL stays valid. */
export const PRESIGN_EXPIRY_SECONDS = 300;

export function isAllowedContentType(contentType: string): contentType is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType);
}

export function isAllowedUploadSize(sizeBytes: number): boolean {
  return Number.isInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_UPLOAD_BYTES;
}

/**
 * Build a collision-resistant object key. Deliberately does not reuse the
 * client-supplied filename verbatim (path traversal / weird-character risk)
 * — it only borrows the extension implied by the validated content type.
 */
export function buildObjectKey(contentType: AllowedContentType): string {
  const extension = contentType.split("/")[1];
  return `products/${randomUUID()}.${extension}`;
}

/**
 * Construct an S3Client configured for R2's S3-compatible endpoint. Reads
 * CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_R2_ACCESS_KEY_ID /
 * CLOUDFLARE_R2_SECRET_ACCESS_KEY per .env.example. Throws if any required
 * var is missing — callers must only invoke this after request validation
 * has already passed, so a missing-credential error never masks a 400.
 */
export function createR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 upload is not configured (missing CLOUDFLARE_* env vars)");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Generate a pre-signed PUT URL for a single object. `client` is passed in
 * (rather than constructed internally) so callers/tests can inject a mock
 * S3Client instead of exercising the real AWS SDK signing path against
 * network credentials that don't exist in this dev environment.
 */
export async function generatePresignedUploadUrl(
  client: S3Client,
  params: { bucket: string; key: string; contentType: string }
): Promise<{ uploadUrl: string; key: string; expiresIn: number }> {
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
  });

  return { uploadUrl, key: params.key, expiresIn: PRESIGN_EXPIRY_SECONDS };
}
