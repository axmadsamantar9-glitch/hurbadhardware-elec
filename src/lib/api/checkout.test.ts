import { describe, it, expect, vi, beforeEach } from "vitest";
import { placeOrder } from "./checkout";
import { db } from "@/lib/db";
import { applyStockDelta } from "@/lib/inventory";
import { redeemCoupon, CouponRedemptionRaceError } from "@/lib/storefront/coupon";

const mockExecuteRaw = vi.fn();
const mockCartItemFindMany = vi.fn();
const mockCartItemDeleteMany = vi.fn();
const mockProductFindMany = vi.fn();
const mockAddressFindUnique = vi.fn();
const mockCouponFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockOrderItemCreate = vi.fn();
const mockInventoryLogCreate = vi.fn();

function makeTx() {
  return {
    $executeRaw: mockExecuteRaw,
    cartItem: { findMany: mockCartItemFindMany, deleteMany: mockCartItemDeleteMany },
    product: { findMany: mockProductFindMany },
    address: { findUnique: mockAddressFindUnique },
    coupon: { findUnique: mockCouponFindUnique },
    order: { create: mockOrderCreate },
    orderItem: { create: mockOrderItemCreate },
    inventoryLog: { create: mockInventoryLogCreate },
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    cart: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(makeTx())),
  },
}));

vi.mock("@/lib/inventory", () => ({
  applyStockDelta: vi.fn(),
}));

vi.mock("@/lib/storefront/coupon", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/storefront/coupon")>("@/lib/storefront/coupon");
  return {
    ...actual,
    redeemCoupon: vi.fn(),
  };
});

function decimal(value: number) {
  return { toNumber: () => value };
}

const PRODUCT = {
  id: "p1",
  isActive: true,
  basePriceUsd: decimal(10),
  stockQuantity: 5,
  nameEn: "Widget",
  nameSo: "Widget SO",
  variants: [] as unknown[],
};

const ADDRESS = { id: "addr1", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRaw.mockResolvedValue(1);
  vi.mocked(applyStockDelta).mockResolvedValue(1);
  mockAddressFindUnique.mockResolvedValue(ADDRESS);
  mockOrderCreate.mockResolvedValue({ id: "order1" });
  mockOrderItemCreate.mockResolvedValue({ id: "oi1" });
  mockInventoryLogCreate.mockResolvedValue({ id: "log1" });
  mockCartItemDeleteMany.mockResolvedValue({ count: 1 });
});

describe("placeOrder", () => {
  it("returns cart_empty when the user has no cart at all", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue(null);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "cart_empty" });
  });

  it("returns cart_empty when the cart has no items", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([]);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "cart_empty" });
  });

  it("returns product_unavailable when the product no longer exists", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "missing", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([]);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "product_unavailable" });
  });

  it("returns product_unavailable when the product is inactive", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([{ ...PRODUCT, isActive: false }]);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "product_unavailable" });
  });

  it("returns product_unavailable when a variantId no longer belongs to an active variant", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: "bad-variant", quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "product_unavailable" });
  });

  it("returns insufficient_stock when requested quantity exceeds available stock (pre-check)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 999 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "insufficient_stock" });
    expect(applyStockDelta).not.toHaveBeenCalled();
  });

  it("returns insufficient_stock when the guarded stock UPDATE affects 0 rows (concurrent-checkout race)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    vi.mocked(applyStockDelta).mockResolvedValue(0);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "insufficient_stock" });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("decrements stock lines sorted by variantId ?? productId ascending (deadlock avoidance)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p2", variantId: null, quantity: 1 },
      { id: "ci2", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([
      { ...PRODUCT, id: "p1" },
      { ...PRODUCT, id: "p2" },
    ]);

    await placeOrder("user-1", { addressId: "addr1" });

    const calls = vi.mocked(applyStockDelta).mock.calls;
    expect(calls[0][1]).toMatchObject({ productId: "p1" });
    expect(calls[1][1]).toMatchObject({ productId: "p2" });
  });

  it("returns address_not_found when the addressId belongs to a different user", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockAddressFindUnique.mockResolvedValue({ id: "addr1", userId: "other-user" });

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "address_not_found" });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("returns address_not_found when the addressId doesn't exist", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockAddressFindUnique.mockResolvedValue(null);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({ ok: false, error: "address_not_found" });
  });

  it("creates order+items+inventory logs and clears the cart on success (no coupon)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 2 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", { addressId: "addr1" });

    expect(result).toEqual({
      ok: true,
      orderId: "order1",
      subtotalUsd: 20,
      discountUsd: 0,
      taxUsd: 0,
      totalUsd: 20,
    });

    expect(mockOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        subtotalUsd: 20,
        discountUsd: 0,
        taxUsd: 0,
        totalUsd: 20,
        chargeCurrency: "USD",
        chargeAmount: 20,
        fxRate: null,
        fxRateAt: null,
        shippingAddressId: "addr1",
        couponId: null,
      }),
    });

    expect(mockOrderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order1",
        productId: "p1",
        quantity: 2,
        unitPriceUsd: 10,
        nameSnapshotEn: "Widget",
        nameSnapshotSo: "Widget SO",
      }),
    });

    expect(mockInventoryLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "p1",
        delta: -2,
        reason: "sale",
        referenceType: "order",
        referenceId: "order1",
      }),
    });

    expect(mockCartItemDeleteMany).toHaveBeenCalledWith({ where: { cartId: "cart1" } });
  });

  it("never trusts a client-supplied price -- unitPriceUsd always comes from the tx-fresh product read", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([{ ...PRODUCT, basePriceUsd: decimal(10) }]);

    await placeOrder("user-1", { addressId: "addr1" });

    expect(mockOrderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ unitPriceUsd: 10 }),
    });
  });

  it("applies a valid coupon's discount to the order total and redeems it", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 2 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockCouponFindUnique.mockResolvedValue({
      id: "coupon1",
      type: "FIXED",
      value: decimal(5),
      minOrderUsd: null,
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
      isActive: true,
    });

    const result = await placeOrder("user-1", { addressId: "addr1", couponCode: "SAVE5" });

    expect(result).toEqual({
      ok: true,
      orderId: "order1",
      subtotalUsd: 20,
      discountUsd: 5,
      taxUsd: 0,
      totalUsd: 15,
    });
    expect(redeemCoupon).toHaveBeenCalledWith(expect.anything(), "coupon1");
  });

  it("returns coupon_invalid (with reason) when the coupon fails validation, without redeeming it", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockCouponFindUnique.mockResolvedValue(null);

    const result = await placeOrder("user-1", { addressId: "addr1", couponCode: "MISSING" });

    expect(result).toEqual({ ok: false, error: "coupon_invalid", couponReason: "not_found" });
    expect(redeemCoupon).not.toHaveBeenCalled();
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("returns coupon_no_longer_valid when redemption races (0 rows affected)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockCouponFindUnique.mockResolvedValue({
      id: "coupon1",
      type: "FIXED",
      value: decimal(5),
      minOrderUsd: null,
      maxUses: 1,
      usedCount: 0,
      expiresAt: null,
      isActive: true,
    });
    vi.mocked(redeemCoupon).mockRejectedValue(new CouponRedemptionRaceError("coupon1"));

    const result = await placeOrder("user-1", { addressId: "addr1", couponCode: "SAVE5" });

    expect(result).toEqual({ ok: false, error: "coupon_no_longer_valid" });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });
});
