import { describe, it, expect, beforeEach, vi } from "vitest";
import { getBrands, getBrandBySlug } from "./brands";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    brand: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

describe("getBrands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active brands ordered by nameEn", async () => {
    vi.mocked(db.brand.findMany).mockResolvedValue([
      { id: "b1", nameEn: "Apple", nameSo: "Apple", slug: "apple", logoUrl: null, isActive: true },
    ] as never);

    const result = await getBrands();

    expect(db.brand.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { nameEn: "asc" },
    });
    expect(result).toHaveLength(1);
  });
});

describe("getBrandBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the active brand matching the slug", async () => {
    vi.mocked(db.brand.findFirst).mockResolvedValue({
      id: "b1",
      nameEn: "Samsung",
      nameSo: "Samsung",
      slug: "samsung",
      logoUrl: null,
      isActive: true,
    } as never);

    const result = await getBrandBySlug("samsung");

    expect(db.brand.findFirst).toHaveBeenCalledWith({
      where: { slug: "samsung", isActive: true },
    });
    expect(result?.slug).toBe("samsung");
  });

  it("returns null when no active brand matches", async () => {
    vi.mocked(db.brand.findFirst).mockResolvedValue(null);
    const result = await getBrandBySlug("does-not-exist");
    expect(result).toBeNull();
  });
});
