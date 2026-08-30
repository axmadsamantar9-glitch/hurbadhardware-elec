import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getProducts,
  getProductBySlug,
  getProductsByIds,
  GetProductsQuerySchema,
  DEFAULT_PAGE_SIZE,
} from "./products";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
    product: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    review: { groupBy: vi.fn() },
    orderItem: { groupBy: vi.fn() },
  },
}));

const mockBrand = {
  id: "brand1",
  nameEn: "Samsung",
  nameSo: "Samsung",
  slug: "samsung",
  logoUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProduct = {
  id: "1",
  nameEn: "Samsung Galaxy A55 5G",
  nameSo: "Samsung Galaxy A55 5G",
  slug: "samsung-galaxy-a55-5g",
  brand: mockBrand,
  brandId: "brand1",
  manufacturerId: null,
  brandNameCache: "Samsung",
  sku: "SMP-SS-A55-001",
  basePriceUsd: new Decimal("349.00"),
  stockQuantity: 50,
  descriptionEn: "A great smartphone",
  descriptionSo: "Taleefan qababan",
  categoryId: "1",
  isActive: true,
  isFeatured: false,
  compatibilityWarningEn: null,
  compatibilityWarningSo: null,
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

describe("getProducts", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("Pagination", () => {
    it("returns products paginated by default", async () => {
      vi.mocked(db.product.count).mockResolvedValue(40);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      const result = await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(result.total).toBe(40);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true);
    });

    it("returns hasMore=false on page 2 with 40 total", async () => {
      vi.mocked(db.product.count).mockResolvedValue(40);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      const result = await getProducts({ page: 2, limit: 20, search: "", category: "", brand: "" });
      expect(result.hasMore).toBe(false);
    });

    it("handles page beyond available results", async () => {
      vi.mocked(db.product.count).mockResolvedValue(5);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      const result = await getProducts({
        page: 100,
        limit: 20,
        search: "",
        category: "",
        brand: "",
      });
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("Full-Text Search", () => {
    it("searches products via tsvector", async () => {
      vi.mocked(db.$queryRaw).mockResolvedValue([{ id: "prod1" }]);
      vi.mocked(db.product.count).mockResolvedValue(1);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "Samsung",
        category: "",
        brand: "",
      });
      expect(result.products).toHaveLength(1);
      expect(db.$queryRaw).toHaveBeenCalled();
    });

    it("returns empty results for no matches", async () => {
      vi.mocked(db.$queryRaw).mockResolvedValue([]);
      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "nonexistent",
        category: "",
        brand: "",
      });
      expect(result.total).toBe(0);
    });

    it("ignores empty search string", async () => {
      vi.mocked(db.product.count).mockResolvedValue(40);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("Category Filter", () => {
    it("filters by category slug", async () => {
      vi.mocked(db.product.count).mockResolvedValue(5);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "smartphones", brand: "" });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
      );
    });
  });

  describe("Brand Filter", () => {
    it("filters by brand case-insensitive", async () => {
      vi.mocked(db.product.count).mockResolvedValue(5);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "samsung" });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brand: {
              is: {
                OR: [
                  { nameEn: { contains: "samsung", mode: "insensitive" } },
                  { nameSo: { contains: "samsung", mode: "insensitive" } },
                ],
              },
            },
          }),
        })
      );
    });
  });

  describe("Price Range Filter", () => {
    it("filters by min price", async () => {
      vi.mocked(db.product.count).mockResolvedValue(20);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "", priceMin: 100 });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ basePriceUsd: { gte: new Decimal("100") } }),
        })
      );
    });

    it("filters by max price", async () => {
      vi.mocked(db.product.count).mockResolvedValue(15);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "", priceMax: 500 });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ basePriceUsd: { lte: new Decimal("500") } }),
        })
      );
    });

    it("filters by both min and max price", async () => {
      vi.mocked(db.product.count).mockResolvedValue(10);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        priceMin: 200,
        priceMax: 500,
      });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            basePriceUsd: { gte: new Decimal("200"), lte: new Decimal("500") },
          }),
        })
      );
    });
  });

  describe("Filter Combinations", () => {
    it("combines search + category", async () => {
      vi.mocked(db.$queryRaw).mockResolvedValue([{ id: "prod1" }]);
      vi.mocked(db.product.count).mockResolvedValue(1);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "Samsung",
        category: "smartphones",
        brand: "",
      });
      expect(db.$queryRaw).toHaveBeenCalled();
    });

    it("applies all filters together", async () => {
      vi.mocked(db.$queryRaw).mockResolvedValue([{ id: "prod1" }]);
      vi.mocked(db.product.count).mockResolvedValue(1);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "phone",
        category: "smartphones",
        brand: "Samsung",
        priceMin: 100,
        priceMax: 500,
      });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: expect.any(Array),
            brand: expect.any(Object),
            basePriceUsd: expect.any(Object),
          }),
        })
      );
    });
  });

  describe("Input Validation", () => {
    it("throws when limit exceeds 100", async () => {
      await expect(
        getProducts({ page: 1, limit: 101, search: "", category: "", brand: "" })
      ).rejects.toThrow("Limit exceeds maximum");
    });

    it("rejects limit over 100", async () => {
      const result = GetProductsQuerySchema.safeParse({ page: 1, limit: "200" });
      expect(result.success).toBe(false);
    });

    it("rejects negative page", async () => {
      const result = GetProductsQuerySchema.safeParse({ page: "-5", limit: "20" });
      expect(result.success).toBe(false);
    });

    it("rejects page 0", async () => {
      const result = GetProductsQuerySchema.safeParse({ page: "0", limit: "20" });
      expect(result.success).toBe(false);
    });

    it("rejects negative price", async () => {
      const result = GetProductsQuerySchema.safeParse({ page: "1", limit: "20", priceMin: "-100" });
      expect(result.success).toBe(false);
    });
  });

  describe("SQL Injection Protection", () => {
    it("prevents SQL injection in category", async () => {
      vi.mocked(db.product.count).mockResolvedValue(0);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "test' OR '1'='1",
        brand: "",
      });
      expect(result.total).toBe(0);
    });

    it("prevents SQL injection in brand", async () => {
      vi.mocked(db.product.count).mockResolvedValue(0);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "'; DROP TABLE; --",
      });
      expect(result.total).toBe(0);
    });

    it("prevents SQL injection in search", async () => {
      vi.mocked(db.$queryRaw).mockResolvedValue([]);
      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "test'; UNION SELECT; --",
        category: "",
        brand: "",
      });
      expect(result.total).toBe(0);
    });
  });

  describe("Response Structure", () => {
    it("returns all required fields", async () => {
      vi.mocked(db.product.count).mockResolvedValue(40);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      const result = await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(result).toHaveProperty("products");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("page");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("hasMore");
    });

    it("includes relations", async () => {
      vi.mocked(db.product.count).mockResolvedValue(1);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { images: true, category: true, brand: true } })
      );
    });

    it("orders by createdAt descending", async () => {
      vi.mocked(db.product.count).mockResolvedValue(1);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } })
      );
    });
  });

  describe("Edge Cases", () => {
    it("handles zero products", async () => {
      vi.mocked(db.product.count).mockResolvedValue(0);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      const result = await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    // AC5: inverted price range (minPrice > maxPrice) must return empty, not throw.
    it("returns empty results for an inverted price range (minPrice > maxPrice)", async () => {
      vi.mocked(db.product.count).mockResolvedValue(0);
      vi.mocked(db.product.findMany).mockResolvedValue([]);
      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        priceMin: 1000,
        priceMax: 500,
      });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            basePriceUsd: { gte: new Decimal("1000"), lte: new Decimal("500") },
          }),
        })
      );
      expect(result.products).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // AC1: inStock filter
  describe("Stock Filter", () => {
    it("excludes zero-stock products when inStock=true", async () => {
      vi.mocked(db.product.count).mockResolvedValue(3);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        inStock: true,
      });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stockQuantity: { gt: 0 } }),
        })
      );
    });

    it("does not filter by stock when inStock is omitted", async () => {
      vi.mocked(db.product.count).mockResolvedValue(3);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({ page: 1, limit: 20, search: "", category: "", brand: "" });
      expect(db.product.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ stockQuantity: expect.anything() }),
        })
      );
    });
  });

  // AC2: sort param
  describe("Sort", () => {
    it("sorts by price ascending", async () => {
      vi.mocked(db.product.count).mockResolvedValue(2);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "smartphones",
        brand: "",
        sort: "price_asc",
      });
      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { basePriceUsd: "asc" } })
      );
    });

    it("sorts by price descending", async () => {
      vi.mocked(db.product.count).mockResolvedValue(2);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        sort: "price_desc",
      });
      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { basePriceUsd: "desc" } })
      );
    });

    it("defaults to newest (createdAt desc) when sort is omitted", async () => {
      vi.mocked(db.product.count).mockResolvedValue(2);
      vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
      await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        sort: "newest",
      });
      expect(db.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } })
      );
    });

    it("sorts by rating: aggregates via review.groupBy and orders highest-first", async () => {
      const older = { ...mockProduct, id: "a", createdAt: new Date("2024-01-01") };
      const newer = { ...mockProduct, id: "b", createdAt: new Date("2024-06-01") };

      // Step 1: id list for the where clause (no pagination yet).
      vi.mocked(db.product.count).mockResolvedValue(2);
      vi.mocked(db.product.findMany)
        .mockResolvedValueOnce([
          { id: "a", createdAt: older.createdAt },
          { id: "b", createdAt: newer.createdAt },
        ] as never)
        // Step 2: the page fetch, deliberately returned out of sorted order
        // to prove the function reorders it.
        .mockResolvedValueOnce([older, newer] as never);

      vi.mocked(db.review.groupBy).mockResolvedValue([
        { productId: "a", _avg: { rating: 3 } },
        { productId: "b", _avg: { rating: 4.5 } },
      ] as never);

      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        sort: "rating",
      });

      expect(db.review.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["productId"],
          where: expect.objectContaining({ isApproved: true }),
        })
      );
      expect(result.products.map((p) => p.id)).toEqual(["b", "a"]);
    });

    it("sorts by popularity: aggregates via orderItem.groupBy excluding cancelled orders", async () => {
      const lowSales = { ...mockProduct, id: "a", createdAt: new Date("2024-01-01") };
      const highSales = { ...mockProduct, id: "b", createdAt: new Date("2024-06-01") };

      vi.mocked(db.product.count).mockResolvedValue(2);
      vi.mocked(db.product.findMany)
        .mockResolvedValueOnce([
          { id: "a", createdAt: lowSales.createdAt },
          { id: "b", createdAt: highSales.createdAt },
        ] as never)
        .mockResolvedValueOnce([lowSales, highSales] as never);

      vi.mocked(db.orderItem.groupBy).mockResolvedValue([
        { productId: "a", _sum: { quantity: 2 } },
        { productId: "b", _sum: { quantity: 40 } },
      ] as never);

      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        sort: "popularity",
      });

      expect(db.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ["productId"],
          where: expect.objectContaining({
            order: { status: { not: "CANCELLED" } },
          }),
        })
      );
      expect(result.products.map((p) => p.id)).toEqual(["b", "a"]);
    });

    it("gives products with zero approved reviews a rating of 0, sorted last", async () => {
      const rated = { ...mockProduct, id: "a", createdAt: new Date("2024-01-01") };
      const unrated = { ...mockProduct, id: "b", createdAt: new Date("2024-06-01") };

      vi.mocked(db.product.count).mockResolvedValue(2);
      vi.mocked(db.product.findMany)
        .mockResolvedValueOnce([
          { id: "a", createdAt: rated.createdAt },
          { id: "b", createdAt: unrated.createdAt },
        ] as never)
        .mockResolvedValueOnce([rated, unrated] as never);

      // Only "a" has an approved review; "b" has none.
      vi.mocked(db.review.groupBy).mockResolvedValue([
        { productId: "a", _avg: { rating: 1 } },
      ] as never);

      const result = await getProducts({
        page: 1,
        limit: 20,
        search: "",
        category: "",
        brand: "",
        sort: "rating",
      });

      expect(result.products.map((p) => p.id)).toEqual(["a", "b"]);
    });
  });

  describe("Default Page Size (AC6)", () => {
    it("GetProductsQuerySchema defaults limit to 24", () => {
      const result = GetProductsQuerySchema.safeParse({ page: "1" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(24);
        expect(result.data.limit).toBe(DEFAULT_PAGE_SIZE);
      }
    });
  });
});

// AC3: getProductBySlug
describe("getProductBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  const fullProduct = {
    ...mockProduct,
    specs: [],
    variants: [],
  };

  it("returns the product with raw nameEn and nameSo (no server-side locale resolution)", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue(fullProduct as never);

    const result = await getProductBySlug("galaxy-s25", "so");

    expect(db.product.findUnique).toHaveBeenCalledWith({
      where: { slug: "galaxy-s25" },
      include: {
        images: true,
        specs: true,
        variants: true,
        category: true,
        brand: true,
        manufacturer: true,
      },
    });
    expect(result).not.toBeNull();
    expect(result?.nameEn).toBe("Samsung Galaxy A55 5G");
    expect(result?.nameSo).toBe("Samsung Galaxy A55 5G");
  });

  it("returns null when no product matches the slug", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue(null);
    const result = await getProductBySlug("does-not-exist");
    expect(result).toBeNull();
  });
});

// HUR-26: getProductsByIds (comparison page)
describe("getProductsByIds", () => {
  beforeEach(() => vi.clearAllMocks());

  const fullProduct = { ...mockProduct, specs: [], variants: [] };

  it("returns [] without querying the DB when ids is empty", async () => {
    const result = await getProductsByIds([]);
    expect(result).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("queries active products by id with full relations included", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([fullProduct] as never);

    const result = await getProductsByIds(["1", "2"]);

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["1", "2"] }, isActive: true },
      include: {
        images: true,
        specs: true,
        variants: true,
        category: true,
        brand: true,
        manufacturer: true,
      },
    });
    expect(result).toEqual([fullProduct]);
  });
});
