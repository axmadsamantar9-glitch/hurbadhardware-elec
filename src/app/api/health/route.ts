import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/request-context";

// Health check exists before there's traffic to monitor (PRD §9.6). The DB
// ping is best-effort: no live DATABASE_URL is configured yet ([011]'s
// external dependency), so a connection failure degrades the response
// instead of throwing.
export async function GET() {
  const correlationId = await getCorrelationId();
  const startedAt = Date.now();

  let database: "ok" | "unreachable" = "ok";
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "unreachable";
    logger.warn("Health check: database unreachable", { correlationId, error });
    if (error instanceof Error) {
      errorCode = "code" in error ? String((error as { code?: unknown }).code) : undefined;
      // Prisma error text never contains the connection string itself, but
      // strip anything postgresql://... shaped as a defense-in-depth belt —
      // this endpoint is public with no secret gate.
      errorMessage = error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 300);
    }
  }

  const status = database === "ok" ? "ok" : "degraded";
  const body: Record<string, unknown> = {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    correlationId,
  };

  // Connection topology (hostname/port/pooler mode) is not a credential — the
  // same info is already embedded in Prisma's own connection-failure message
  // — so it's reported unconditionally to make this deployable's actual
  // runtime config provable without a round-trip through a dashboard/secret.
  // Never include the user, password, or raw connection string.
  const rawUrl = process.env.DATABASE_URL;
  let hostname: string | null = null;
  let port: string | null = null;
  let pgbouncer = false;
  let connectionLimit: string | null = null;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      hostname = parsed.hostname;
      port = parsed.port || null;
      pgbouncer = parsed.searchParams.get("pgbouncer") === "true";
      connectionLimit = parsed.searchParams.get("connection_limit");
    } catch {
      // malformed URL: report presence only, not the parse failure detail
    }
  }
  // errorMessage is already stripped of anything postgresql://... shaped and
  // capped at 300 chars (see above) -- Prisma's connection-failure text
  // never carries the user/password by design, so this is safe to return
  // unconditionally. No CRON_SECRET exists in this project's Vercel env, so
  // gating behind one isn't an option -- and isn't needed once the message
  // itself is sanitized.
  body.diagnostics = {
    databaseUrlPresent: Boolean(rawUrl),
    hostname,
    port,
    pgbouncer,
    connectionLimit,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
  };

  logger.info("Health check", { ...body, durationMs: Date.now() - startedAt });

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
