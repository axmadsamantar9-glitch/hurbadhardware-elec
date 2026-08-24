import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// Mock the dependencies
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/request-context", () => ({
  getCorrelationId: vi.fn(),
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with status ok when database is reachable", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");

    const testCorrelationId = "550e8400-e29b-41d4-a716-446655440000";
    vi.mocked(db.$queryRaw).mockResolvedValue([{ count: 1 }]);
    vi.mocked(getCorrelationId).mockResolvedValue(testCorrelationId);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.correlationId).toBe(testCorrelationId);
  });

  it("returns 503 with status degraded when database is unreachable", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");

    const testCorrelationId = "550e8400-e29b-41d4-a716-446655440000";
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("Connection refused"));
    vi.mocked(getCorrelationId).mockResolvedValue(testCorrelationId);

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unreachable");
    expect(body.correlationId).toBe(testCorrelationId);
  });

  it("includes correlation ID in the response body", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");

    const testCorrelationId = "abcdef01-2345-6789-abcd-ef0123456789";
    vi.mocked(db.$queryRaw).mockResolvedValue([{ count: 1 }]);
    vi.mocked(getCorrelationId).mockResolvedValue(testCorrelationId);

    const response = await GET();
    const body = await response.json();

    expect(body.correlationId).toBe(testCorrelationId);
  });

  it("does not expose database error details in the response", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");

    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("SENSITIVE_DB_CONNECTION_STRING_HERE"));
    vi.mocked(getCorrelationId).mockResolvedValue("test-uuid");

    const response = await GET();
    const body = await response.json();
    const bodyString = JSON.stringify(body);

    expect(bodyString).not.toContain("SENSITIVE_DB_CONNECTION_STRING_HERE");
  });

  it("includes uptimeSeconds in the response", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");

    vi.mocked(db.$queryRaw).mockResolvedValue([{ count: 1 }]);
    vi.mocked(getCorrelationId).mockResolvedValue("test-uuid");

    const response = await GET();
    const body = await response.json();

    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("includes database status in the response", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");

    vi.mocked(db.$queryRaw).mockResolvedValue([{ count: 1 }]);
    vi.mocked(getCorrelationId).mockResolvedValue("test-uuid");

    const response = await GET();
    const body = await response.json();

    expect(["ok", "unreachable"]).toContain(body.database);
  });

  it("logs health check with correlation ID when database is ok", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");
    const { logger } = await import("@/lib/logger");

    const testCorrelationId = "550e8400-e29b-41d4-a716-446655440000";
    vi.mocked(db.$queryRaw).mockResolvedValue([{ count: 1 }]);
    vi.mocked(getCorrelationId).mockResolvedValue(testCorrelationId);

    await GET();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Health check",
      expect.objectContaining({
        status: "ok",
        correlationId: testCorrelationId,
      })
    );
  });

  it("logs health check warning when database is unreachable", async () => {
    const { db } = await import("@/lib/db");
    const { getCorrelationId } = await import("@/lib/request-context");
    const { logger } = await import("@/lib/logger");

    const testCorrelationId = "550e8400-e29b-41d4-a716-446655440000";
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("DB connection failed"));
    vi.mocked(getCorrelationId).mockResolvedValue(testCorrelationId);

    await GET();

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "Health check: database unreachable",
      expect.objectContaining({
        correlationId: testCorrelationId,
      })
    );
  });
});
