import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { GET } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { getProducts, DEFAULT_PAGE_SIZE } from "@/lib/api/products";

vi.mock("@/lib/api/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/products")>("@/lib/api/products");
  return {
    ...actual,
    getProducts: vi.fn(),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockProduct = {
  id: "1",
  nameEn: "Samsung Galaxy A55 5G",
  nameSo: "Samsung Galaxy A55 5G",
  slug: "samsung-galaxy-a55-5g",
  brand: {
    id: "brand1",
    nameEn: "Samsung",
    nameSo: "Samsung",
    slug: "samsung",
    logoUrl: null,
    isActive: true,
  },
  sku: "SMP-SS-A55-001",
  basePriceUsd: new Decimal("349.00"),
  stockQuantity: 50,
  descriptionEn: "A great smartphone",
  descriptionSo: "Taleefan qababan",
  categoryId: "1",
  isActive: true,
  isFeatured: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [{ id: "img1", url: "https://example.com/img1.jpg", position: 0 }],
  category: {
    id: "1",
    nameEn: "Smartphones",
    nameSo: "Taleefannada Casriga ah",
    slug: "smartphones",
    skuPrefix: "SMP",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

function makeRequest(ip: string, query = ""): Request {
  return new Request(`http://localhost/api/products${query}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/products (HUB-25 QA bounce-back)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    vi.mocked(getProducts).mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products: [mockProduct] as any,
      total: 1,
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      hasMore: false,
    });
  });

  describe("happy path", () => {
    it("returns 200 with redacted products (no stockQuantity)", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(makeRequest("203.0.113.10") as any);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { products: Array<Record<string, unknown>> };
      expect(body.products).toHaveLength(1);
      expect(body.products[0]).not.toHaveProperty("stockQuantity");
      expect(body.products[0].inStock).toBe(true);
    });
  });

  describe("AC6 regression: default limit", () => {
    it("resolves limit to 24 (DEFAULT_PAGE_SIZE), not 20, when no limit param is present", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await GET(makeRequest("203.0.113.11") as any);

      expect(getProducts).toHaveBeenCalledTimes(1);
      const calledWith = vi.mocked(getProducts).mock.calls[0][0];
      expect(calledWith.limit).toBe(24);
      expect(calledWith.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(calledWith.limit).not.toBe(20);
    });

    it("still respects an explicit ?limit= query param", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await GET(makeRequest("203.0.113.12", "?limit=10") as any);

      const calledWith = vi.mocked(getProducts).mock.calls[0][0];
      expect(calledWith.limit).toBe(10);
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
