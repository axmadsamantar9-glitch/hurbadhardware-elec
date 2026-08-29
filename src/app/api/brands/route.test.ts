import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { getBrands } from "@/lib/api/brands";

vi.mock("@/lib/api/brands", () => ({
  getBrands: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeRequest(ip: string): Request {
  return new Request("http://localhost/api/brands", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/brands (HUR-55)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    vi.mocked(getBrands).mockResolvedValue([]);
  });

  describe("happy path", () => {
    it("returns 200 with a brands array", async () => {
      vi.mocked(getBrands).mockResolvedValue([
        {
          id: "b1",
          nameEn: "Samsung",
          nameSo: "Samsung",
          slug: "samsung",
          logoUrl: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(makeRequest("203.0.113.10") as any);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { brands: Array<Record<string, unknown>> };
      expect(body.brands).toHaveLength(1);
      expect(body.brands[0].slug).toBe("samsung");
    });

    it("never includes supplier data in the response (HUR-55 AC2)", async () => {
      vi.mocked(getBrands).mockResolvedValue([
        {
          id: "b1",
          nameEn: "Samsung",
          nameSo: "Samsung",
          slug: "samsung",
          logoUrl: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(makeRequest("203.0.113.13") as any);
      const text = await response.text();
      expect(text.toLowerCase()).not.toMatch(/supplier/);
    });
  });

  describe("rate limiting", () => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocked = await GET(makeRequest(ip1) as any);
      expect(blocked.status).toBe(429);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allowed = await GET(makeRequest(ip2) as any);
      expect(allowed.status).toBe(200);
    });
  });
});
