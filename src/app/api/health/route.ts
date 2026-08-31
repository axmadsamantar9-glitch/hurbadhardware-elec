import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/request-context";

// Health check exists before there's traffic to monitor (PRD §9.6). The DB
// ping is best-effort: no live DATABASE_URL is configured yet ([011]'s
// external dependency), so a connection failure degrades the response
// instead of throwing.
export async function GET(request?: NextRequest) {
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
      // this response can be requested by anyone who knows CRON_SECRET, not
      // just operators with dashboard access.
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

  // Extra connection diagnostics only for callers who present CRON_SECRET —
  // hostname/port/pgbouncer aren't credentials, but this still isn't public
  // information by default. Never include user, password, or the raw URL.
  const providedSecret = request?.headers.get("x-diagnostic-secret") ?? null;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && providedSecret === cronSecret) {
    const rawUrl = process.env.DATABASE_URL;
    let hostname: string | null = null;
    let port: string | null = null;
    let pgbouncer = false;
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        hostname = parsed.hostname;
        port = parsed.port || null;
        pgbouncer = parsed.searchParams.get("pgbouncer") === "true";
      } catch {
        // malformed URL: report presence only, not the parse failure detail
      }
    }
    body.diagnostics = {
      databaseUrlPresent: Boolean(rawUrl),
      hostname,
      port,
      pgbouncer,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
    };
  }

  logger.info("Health check", { ...body, durationMs: Date.now() - startedAt });

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
