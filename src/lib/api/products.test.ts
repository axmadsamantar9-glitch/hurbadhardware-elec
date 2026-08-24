import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { getProducts, GetProductsQuerySchema } from "./products";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(),
    product: { count: vi.fn(), findMany: vi.fn() },
  },
}));

const mockProduct = {
  id: "1",
  nameEn: "Samsung Galaxy A55 5G",
  nameSo: "Samsung Galaxy A55 5G",
  slug: "samsung-galaxy-a55-5g",
  brand: "Samsung",
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
          where: expect.objectContaining({ brand: { contains: "samsung", mode: "insensitive" } }),
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
        expect.objectContaining({ include: { images: true, category: true } })
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
  });
});
