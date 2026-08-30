import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getWishlistProducts,
  isProductWishlisted,
  addToWishlist,
  removeFromWishlist,
} from "./wishlist";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    wishlist: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    product: { findUnique: vi.fn() },
  },
}));

const mockProduct = { id: "p1", isActive: true, name: "Widget" };

describe("getWishlistProducts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns products from the user's wishlist rows, newest first", async () => {
    vi.mocked(db.wishlist.findMany).mockResolvedValue([{ product: mockProduct }] as never);

    const result = await getWishlistProducts("user-1");

    expect(db.wishlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
      })
    );
    expect(result).toEqual([mockProduct]);
  });

  it("scopes strictly to the given userId — never a caller-supplied filter beyond that", async () => {
    vi.mocked(db.wishlist.findMany).mockResolvedValue([]);

    await getWishlistProducts("user-2");

    const callArgs = vi.mocked(db.wishlist.findMany).mock.calls[0][0];
    expect(callArgs?.where).toEqual({ userId: "user-2" });
  });
});

describe("isProductWishlisted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when a matching row exists", async () => {
    vi.mocked(db.wishlist.findUnique).mockResolvedValue({ userId: "user-1" } as never);

    const result = await isProductWishlisted("user-1", "p1");

    expect(result).toBe(true);
    expect(db.wishlist.findUnique).toHaveBeenCalledWith({
      where: { userId_productId: { userId: "user-1", productId: "p1" } },
      select: { userId: true },
    });
  });

  it("returns false when no matching row exists", async () => {
    vi.mocked(db.wishlist.findUnique).mockResolvedValue(null);

    const result = await isProductWishlisted("user-1", "p1");

    expect(result).toBe(false);
  });
});

describe("addToWishlist", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns product_not_found when the product doesn't exist", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue(null);

    const result = await addToWishlist("user-1", "missing");

    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(db.wishlist.upsert).not.toHaveBeenCalled();
  });

  it("returns product_not_found when the product is inactive", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({ id: "p1", isActive: false } as never);

    const result = await addToWishlist("user-1", "p1");

    expect(result).toEqual({ ok: false, error: "product_not_found" });
    expect(db.wishlist.upsert).not.toHaveBeenCalled();
  });

  it("upserts the wishlist row (idempotent add) for an active product", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({ id: "p1", isActive: true } as never);
    vi.mocked(db.wishlist.upsert).mockResolvedValue({} as never);

    const result = await addToWishlist("user-1", "p1");

    expect(result).toEqual({ ok: true });
    expect(db.wishlist.upsert).toHaveBeenCalledWith({
      where: { userId_productId: { userId: "user-1", productId: "p1" } },
      update: {},
      create: { userId: "user-1", productId: "p1" },
    });
  });
});

describe("removeFromWishlist", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the wishlist row scoped to userId + productId", async () => {
    vi.mocked(db.wishlist.deleteMany).mockResolvedValue({ count: 1 } as never);

    await removeFromWishlist("user-1", "p1");

    expect(db.wishlist.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", productId: "p1" },
    });
  });
});
