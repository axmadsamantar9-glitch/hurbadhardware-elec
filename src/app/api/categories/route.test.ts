import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";

vi.mock("@/lib/api/categories", () => ({
  getCategories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeRequest(ip: string): Request {
  return new Request("http://localhost/api/categories", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/categories — rate limiting (HUB-25 gap closure)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("allows requests up to the PUBLIC threshold (30/min)", async () => {
    const { threshold } = getRateLimitConfig("public");
    const ip = "203.0.113.50";

    for (let i = 0; i < threshold; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(makeRequest(ip) as any);
      expect(response.status).toBe(200);
    }
  });

  it("rejects the request past the PUBLIC threshold with 429 and Retry-After", async () => {
    const { threshold } = getRateLimitConfig("public");
    const ip = "203.0.113.51";

    for (let i = 0; i < threshold; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await GET(makeRequest(ip) as any);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await GET(makeRequest(ip) as any);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();

    const body = (await response.json()) as Record<string, unknown>;
    expect((body.error as Record<string, unknown>).code).toBe("rate_limit_exceeded");
  });

  it("isolates the rate limit by client IP", async () => {
    const { threshold } = getRateLimitConfig("public");
    const ip1 = "203.0.113.52";
    const ip2 = "203.0.113.53";

    for (let i = 0; i < threshold; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await GET(makeRequest(ip1) as any);
    }
    // ip1 is now exhausted
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocked = await GET(makeRequest(ip1) as any);
    expect(blocked.status).toBe(429);

    // A different IP is unaffected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allowed = await GET(makeRequest(ip2) as any);
    expect(allowed.status).toBe(200);
  });
});
