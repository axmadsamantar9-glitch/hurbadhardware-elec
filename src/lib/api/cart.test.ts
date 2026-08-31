import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  findOrCreateCart,
  getCartLinesPriced,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
  mergeGuestCartIntoDb,
} from "./cart";
import { db } from "@/lib/db";
import { priceCartLines } from "@/lib/api/cart-pricing";

const mockExecuteRaw = vi.fn();
const mockCartFindFirst = vi.fn();
const mockCartCreate = vi.fn();
const mockCartItemFindFirst = vi.fn();
const mockCartItemFindMany = vi.fn();
const mockCartItemCreate = vi.fn();
const mockCartItemUpdate = vi.fn();

function makeTx() {
  return {
    $executeRaw: mockExecuteRaw,
    cart: { findFirst: mockCartFindFirst, create: mockCartCreate },
    cartItem: {
      findFirst: mockCartItemFindFirst,
      findMany: mockCartItemFindMany,
      create: mockCartItemCreate,
      update: mockCartItemUpdate,
    },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(makeTx())),
    cart: { findFirst: vi.fn() },
    cartItem: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    product: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@/lib/api/cart-pricing", () => ({
  priceCartLines: vi.fn(),
}));

describe("findOrCreateCart", () => {
  beforeEach(() => vi.clearAllMocks());

  it("takes an advisory lock keyed by userId before checking for an existing cart", async () => {
    mockCartFindFirst.mockResolvedValue(null);
    mockCartCreate.mockResolvedValue({ id: "cart1" });

    await findOrCreateCart("user-1");

    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(mockCartFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });

  it("returns the existing cart without creating a new one", async () => {
    mockCartFindFirst.mockResolvedValue({ id: "existing-cart" });

    const result = await findOrCreateCart("user-1");

    expect(result).toEqual({ id: "existing-cart" });
    expect(mockCartCreate).not.toHaveBeenCalled();
  });

  it("creates a cart when none exists", async () => {
    mockCartFindFirst.mockResolvedValue(null);
    mockCartCreate.mockResolvedValue({ id: "new-cart" });

    const result = await findOrCreateCart("user-1");

    expect(result).toEqual({ id: "new-cart" });
    expect(mockCartCreate).toHaveBeenCalledWith({
      data: { userId: "user-1" },
      select: { id: true },
    });
  });
});

describe("getCartLinesPriced", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty cart without creating a Cart row when the user has none", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue(null);

    const result = await getCartLinesPriced("user-1");

    expect(result).toEqual({ lines: [], subtotalUsd: 0 });
    expect(priceCartLines).not.toHaveBeenCalled();
  });

  it("re-prices the user's DB cart items live", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    vi.mocked(db.cartItem.findMany).mockResolvedValue([
      { id: "item1", cartId: "cart1", productId: "p1", variantId: null, quantity: 2 },
    ] as never);
    vi.mocked(priceCartLines).mockResolvedValue({ lines: [], subtotalUsd: 0 });

    await getCartLinesPriced("user-1");

    expect(priceCartLines).toHaveBeenCalledWith([
      { cartItemId: "item1", productId: "p1", variantId: null, quantity: 2 },
    ]);
  });
});

describe("addCartItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-positive quantity", async () => {
    const result = await addCartItem("user-1", { productId: "p1", quantity: 0 });
    expect(result).toEqual({ ok: false, error: "invalid_quantity" });
    expect(db.product.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-integer quantity", async () => {
    const result = await addCartItem("user-1", { productId: "p1", quantity: 1.5 });
    expect(result).toEqual({ ok: false, error: "invalid_quantity" });
  });

  it("returns product_not_found for a missing product", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue(null);

    const result = await addCartItem("user-1", { productId: "missing", quantity: 1 });

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it("returns product_not_found for an inactive product", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({ id: "p1", isActive: false } as never);

    const result = await addCartItem("user-1", { productId: "p1", quantity: 1 });

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it("creates a new cart line when none exists for this product+variant", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({ id: "p1", isActive: true } as never);
    mockCartFindFirst.mockResolvedValue({ id: "cart1" });
    mockCartItemFindFirst.mockResolvedValue(null);

    const result = await addCartItem("user-1", { productId: "p1", quantity: 2 });

    expect(result).toEqual({ ok: true });
    expect(mockCartItemCreate).toHaveBeenCalledWith({
      data: { cartId: "cart1", productId: "p1", variantId: null, quantity: 2 },
    });
    expect(mockCartItemUpdate).not.toHaveBeenCalled();
  });

  it("increments quantity (not creates a duplicate line) when a matching line already exists", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({ id: "p1", isActive: true } as never);
    mockCartFindFirst.mockResolvedValue({ id: "cart1" });
    mockCartItemFindFirst.mockResolvedValue({ id: "item1", quantity: 3 });

    const result = await addCartItem("user-1", { productId: "p1", quantity: 2 });

    expect(result).toEqual({ ok: true });
    expect(mockCartItemUpdate).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { quantity: 5 },
    });
    expect(mockCartItemCreate).not.toHaveBeenCalled();
  });

  it("never reads a client-supplied price field even if present on the input", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({ id: "p1", isActive: true } as never);
    mockCartFindFirst.mockResolvedValue({ id: "cart1" });
    mockCartItemFindFirst.mockResolvedValue(null);

    await addCartItem("user-1", {
      productId: "p1",
      quantity: 1,
      // @ts-expect-error -- deliberately simulating an attacker-supplied extra field
      priceUsd: 0.01,
    });

    expect(mockCartItemCreate).toHaveBeenCalledWith({
      data: { cartId: "cart1", productId: "p1", variantId: null, quantity: 1 },
    });
  });

  it("rejects an invalid variant that doesn't belong to the product", async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue({
      id: "p1",
      isActive: true,
      variants: [],
    } as never);

    const result = await addCartItem("user-1", {
      productId: "p1",
      variantId: "bad-variant",
      quantity: 1,
    });

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });
});

describe("updateCartItemQuantity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-positive quantity", async () => {
    const result = await updateCartItemQuantity("user-1", "item1", 0);
    expect(result).toEqual({ ok: false, error: "invalid_quantity" });
  });

  it("returns not_found when the cart item belongs to a different user", async () => {
    vi.mocked(db.cartItem.findUnique).mockResolvedValue({
      id: "item1",
      cart: { userId: "other-user" },
    } as never);

    const result = await updateCartItemQuantity("user-1", "item1", 5);

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(db.cartItem.update).not.toHaveBeenCalled();
  });

  it("updates the quantity when the item belongs to this user", async () => {
    vi.mocked(db.cartItem.findUnique).mockResolvedValue({
      id: "item1",
      cart: { userId: "user-1" },
    } as never);

    const result = await updateCartItemQuantity("user-1", "item1", 5);

    expect(result).toEqual({ ok: true });
    expect(db.cartItem.update).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { quantity: 5 },
    });
  });
});

describe("removeCartItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when the item belongs to a different user", async () => {
    vi.mocked(db.cartItem.findUnique).mockResolvedValue({
      id: "item1",
      cart: { userId: "other-user" },
    } as never);

    await removeCartItem("user-1", "item1");

    expect(db.cartItem.delete).not.toHaveBeenCalled();
  });

  it("deletes the item when it belongs to this user", async () => {
    vi.mocked(db.cartItem.findUnique).mockResolvedValue({
      id: "item1",
      cart: { userId: "user-1" },
    } as never);

    await removeCartItem("user-1", "item1");

    expect(db.cartItem.delete).toHaveBeenCalledWith({ where: { id: "item1" } });
  });

  it("is idempotent when the item doesn't exist at all", async () => {
    vi.mocked(db.cartItem.findUnique).mockResolvedValue(null);

    await expect(removeCartItem("user-1", "missing")).resolves.toBeUndefined();
    expect(db.cartItem.delete).not.toHaveBeenCalled();
  });
});

describe("mergeGuestCartIntoDb", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when the guest cart has no valid lines", async () => {
    await mergeGuestCartIntoDb("user-1", [{ productId: "", variantId: null, quantity: 1 }]);
    expect(db.product.findMany).not.toHaveBeenCalled();
  });

  it("drops guest lines referencing products that no longer exist/are inactive", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([]);

    await mergeGuestCartIntoDb("user-1", [{ productId: "gone", variantId: null, quantity: 2 }]);

    expect(mockCartFindFirst).not.toHaveBeenCalled();
  });

  it("sums quantities with existing DB lines for a valid guest line", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      { id: "p1", isActive: true, variants: [] },
    ] as never);
    mockCartFindFirst.mockResolvedValue({ id: "cart1" });
    mockCartItemFindMany.mockResolvedValue([
      { id: "item1", cartId: "cart1", productId: "p1", variantId: null, quantity: 3 },
    ]);

    await mergeGuestCartIntoDb("user-1", [{ productId: "p1", variantId: null, quantity: 2 }]);

    expect(mockCartItemUpdate).toHaveBeenCalledWith({
      where: { id: "item1" },
      data: { quantity: 5 },
    });
  });

  it("creates a new line for a valid guest line with no DB counterpart", async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([
      { id: "p2", isActive: true, variants: [] },
    ] as never);
    mockCartFindFirst.mockResolvedValue({ id: "cart1" });
    mockCartItemFindMany.mockResolvedValue([]);

    await mergeGuestCartIntoDb("user-1", [{ productId: "p2", variantId: null, quantity: 4 }]);

    expect(mockCartItemCreate).toHaveBeenCalledWith({
      data: { cartId: "cart1", productId: "p2", variantId: null, quantity: 4 },
    });
  });
});
