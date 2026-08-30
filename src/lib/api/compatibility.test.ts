import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCompatibilityForProduct,
  getCompatibilityForProductByType,
  getProductIdsCompatibleWith,
} from "./compatibility";
import { db } from "@/lib/db";
import { CompatibilityType } from "@/types/database";

vi.mock("@/lib/db", () => ({
  db: {
    compatibilityAttribute: { findMany: vi.fn() },
  },
}));

describe("getCompatibilityForProduct", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns facts ordered by type then sortOrder", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([
      {
        id: "c1",
        productId: "p1",
        type: CompatibilityType.CONNECTOR,
        valueSlug: "usb-c",
        valueEn: "USB-C",
        valueSo: "USB-C",
        warningEn: null,
        warningSo: null,
        sortOrder: 0,
      },
      {
        id: "c2",
        productId: "p1",
        type: CompatibilityType.POWER,
        valueSlug: "5v-3a",
        valueEn: "5V/3A",
        valueSo: "5V/3A",
        warningEn: "Overheating risk on non-PD hardware",
        warningSo: null,
        sortOrder: 0,
      },
    ] as never);

    const result = await getCompatibilityForProduct("p1");

    expect(db.compatibilityAttribute.findMany).toHaveBeenCalledWith({
      where: { productId: "p1" },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    });
    expect(result).toHaveLength(2);
    expect(result[1].warningEn).toBe("Overheating risk on non-PD hardware");
  });

  it("returns an empty array for a product with no compatibility data", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([]);

    const result = await getCompatibilityForProduct("no-facts-product");

    expect(result).toEqual([]);
  });

  it("returns an empty array for a product id that does not exist", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([]);

    const result = await getCompatibilityForProduct("does-not-exist");

    expect(db.compatibilityAttribute.findMany).toHaveBeenCalledWith({
      where: { productId: "does-not-exist" },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    });
    expect(result).toEqual([]);
  });
});

describe("getCompatibilityForProductByType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by productId and type, ordered by sortOrder", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([
      {
        id: "c1",
        productId: "p1",
        type: CompatibilityType.DEVICE,
        valueSlug: "iphone-15",
        valueEn: "iPhone 15",
        valueSo: "iPhone 15",
        warningEn: null,
        warningSo: null,
        sortOrder: 0,
      },
    ] as never);

    const result = await getCompatibilityForProductByType("p1", CompatibilityType.DEVICE);

    expect(db.compatibilityAttribute.findMany).toHaveBeenCalledWith({
      where: { productId: "p1", type: CompatibilityType.DEVICE },
      orderBy: { sortOrder: "asc" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].valueSlug).toBe("iphone-15");
  });

  it("returns an empty array when the product has no facts of that type", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([]);

    const result = await getCompatibilityForProductByType("p1", CompatibilityType.CONSUMABLE);

    expect(result).toEqual([]);
  });
});

describe("getProductIdsCompatibleWith", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the ids of every product declaring the given fact", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([
      { productId: "p1" },
      { productId: "p2" },
    ] as never);

    const result = await getProductIdsCompatibleWith(CompatibilityType.DEVICE, "iphone-15");

    expect(db.compatibilityAttribute.findMany).toHaveBeenCalledWith({
      where: { type: CompatibilityType.DEVICE, valueSlug: "iphone-15" },
      select: { productId: true },
    });
    expect(result).toEqual(["p1", "p2"]);
  });

  it("returns an empty array when no product declares that fact", async () => {
    vi.mocked(db.compatibilityAttribute.findMany).mockResolvedValue([]);

    const result = await getProductIdsCompatibleWith(CompatibilityType.OS_SUPPORT, "android-99");

    expect(result).toEqual([]);
  });
});
