import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/request-context";

// Health check exists before there's traffic to monitor (PRD §9.6). The DB
// ping is best-effort: no live DATABASE_URL is configured yet ([011]'s
// external dependency), so a connection failure degrades the response
// instead of throwing.
//
// The public response deliberately carries only status/database ("ok" |
// "unreachable") -- never the underlying error, connection-string shape, or
// credential details. Full error detail (including the Prisma error object)
// goes to the structured logger only, which is server-side/operator-only and
// already redacts DATABASE_URL/DIRECT_URL by key (src/lib/logger.ts).
export async function GET() {
  const correlationId = await getCorrelationId();
  const startedAt = Date.now();

  let database: "ok" | "unreachable" = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "unreachable";
    logger.warn("Health check: database unreachable", { correlationId, error });
  }

  const status = database === "ok" ? "ok" : "degraded";
  const body = {
    status,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    correlationId,
  };

  logger.info("Health check", { ...body, durationMs: Date.now() - startedAt });

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
