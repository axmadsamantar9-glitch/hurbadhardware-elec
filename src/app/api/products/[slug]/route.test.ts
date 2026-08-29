import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { GET } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { getProductBySlug } from "@/lib/api/products";

vi.mock("@/lib/api/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/products")>("@/lib/api/products");
  return {
    ...actual,
    getProductBySlug: vi.fn(),
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
  specs: [
    {
      id: "spec1",
      productId: "1",
      nameEn: "Storage",
      nameSo: "Kaydka",
      valueEn: "128GB",
      valueSo: "128GB",
    },
  ],
  variants: [
    {
      id: "var1",
      productId: "1",
      nameEn: "Black / 128GB",
      nameSo: "Madow / 128GB",
      sku: "SMP-SS-A55-001-BLK",
      priceModifierUsd: new Decimal("0.00"),
      stockQuantity: 20,
    },
  ],
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

function makeRequest(ip: string, slug = "samsung-galaxy-a55-5g"): Request {
  return new Request(`http://localhost/api/products/${slug}`, {
    headers: { "x-forwarded-for": ip },
  });
}

function makeParams(slug = "samsung-galaxy-a55-5g"): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/products/[slug] (HUB-25 QA bounce-back)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getProductBySlug).mockResolvedValue(mockProduct as any);
  });

  describe("happy path", () => {
    it("returns 200 with the product, redacted of stockQuantity (Iron Rule #6)", async () => {
      const response = await GET(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeRequest("203.0.113.20") as any,
        makeParams()
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as Record<string, unknown>;
      expect(body).not.toHaveProperty("stockQuantity");
      expect(body.inStock).toBe(true);

      const variants = body.variants as Array<Record<string, unknown>>;
      expect(variants).toHaveLength(1);
      expect(variants[0]).not.toHaveProperty("stockQuantity");
      expect(variants[0].inStock).toBe(true);
    });

    it("returns 404 when the product does not exist", async () => {
      vi.mocked(getProductBySlug).mockResolvedValue(null);
      const response = await GET(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        makeRequest("203.0.113.21", "does-not-exist") as any,
        makeParams("does-not-exist")
      );
      expect(response.status).toBe(404);
    });
  });

  describe("rate limiting", () => {
    it("allows requests up to the PUBLIC threshold (30/min)", async () => {
      const { threshold } = getRateLimitConfig("public");
      const ip = "203.0.113.60";

      for (let i = 0; i < threshold; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await GET(makeRequest(ip) as any, makeParams());
        expect(response.status).toBe(200);
      }
    });

    it("rejects the request past the PUBLIC threshold with 429 and Retry-After", async () => {
      const { threshold } = getRateLimitConfig("public");
      const ip = "203.0.113.61";

      for (let i = 0; i < threshold; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await GET(makeRequest(ip) as any, makeParams());
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await GET(makeRequest(ip) as any, makeParams());
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBeTruthy();

      const body = (await response.json()) as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).code).toBe("rate_limit_exceeded");
    });

    it("isolates the rate limit by client IP", async () => {
      const { threshold } = getRateLimitConfig("public");
      const ip1 = "203.0.113.62";
      const ip2 = "203.0.113.63";

      for (let i = 0; i < threshold; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await GET(makeRequest(ip1) as any, makeParams());
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocked = await GET(makeRequest(ip1) as any, makeParams());
      expect(blocked.status).toBe(429);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allowed = await GET(makeRequest(ip2) as any, makeParams());
      expect(allowed.status).toBe(200);
    });
  });
});
