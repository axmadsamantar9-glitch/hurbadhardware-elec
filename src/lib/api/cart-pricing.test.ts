import { describe, it, expect, beforeEach, vi } from "vitest";
import { priceCartLines } from "./cart-pricing";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: { product: { findMany: vi.fn() } },
}));

function decimalLike(value: number) {
  return { toNumber: () => value };
}

const baseProduct = {
  id: "p1",
  slug: "widget",
  nameEn: "Widget",
  nameSo: "Widget SO",
  basePriceUsd: decimalLike(25),
  stockQuantity: 5,
  isActive: true,
  images: [{ url: "https://example.com/img.jpg", isPrimary: true, position: 0 }],
  variants: [],
};

describe("priceCartLines", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty priced cart for no lines, without querying the DB", async () => {
    const result = await priceCartLines([]);
    expect(result).toEqual({ lines: [], subtotalUsd: 0 });
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("re-fetches the live product price rather than trusting any input price", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([baseProduct] as never);

    const result = await priceCartLines([{ productId: "p1", variantId: null, quantity: 2 }]);

    expect(result.lines[0].unitPriceUsd).toBe(25);
    expect(result.lines[0].lineTotalUsd).toBe(50);
    expect(result.subtotalUsd).toBe(50);
  });

  it("uses the variant's price when a variantId is given", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      {
        ...baseProduct,
        variants: [
          {
            id: "v1",
            productId: "p1",
            priceUsd: decimalLike(40),
            stockQuantity: 3,
            isActive: true,
          },
        ],
      },
    ] as never);

    const result = await priceCartLines([{ productId: "p1", variantId: "v1", quantity: 1 }]);

    expect(result.lines[0].unitPriceUsd).toBe(40);
  });

  it("drops a line whose product no longer exists", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([]);

    const result = await priceCartLines([{ productId: "gone", variantId: null, quantity: 1 }]);

    expect(result).toEqual({ lines: [], subtotalUsd: 0 });
  });

  it("drops a line whose variantId doesn't belong to the product", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([baseProduct] as never);

    const result = await priceCartLines([
      { productId: "p1", variantId: "bad-variant", quantity: 1 },
    ]);

    expect(result).toEqual({ lines: [], subtotalUsd: 0 });
  });

  it("flags insufficientStock when quantity exceeds available stock", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([baseProduct] as never);

    const result = await priceCartLines([{ productId: "p1", variantId: null, quantity: 10 }]);

    expect(result.lines[0].insufficientStock).toBe(true);
  });

  it("flags inStock=false and productActive=false for a deactivated product", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      { ...baseProduct, isActive: false },
    ] as never);

    const result = await priceCartLines([{ productId: "p1", variantId: null, quantity: 1 }]);

    expect(result.lines[0].inStock).toBe(false);
    expect(result.lines[0].productActive).toBe(false);
  });

  it("never exposes a raw price field beyond the computed unit/line totals from any client-supplied input", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([baseProduct] as never);

    const result = await priceCartLines([
      // @ts-expect-error -- deliberately simulating an attacker-supplied price field
      { productId: "p1", variantId: null, quantity: 1, unitPriceUsd: 0.01 },
    ]);

    // The output price is the live DB price (25), not the injected 0.01.
    expect(result.lines[0].unitPriceUsd).toBe(25);
  });
});
