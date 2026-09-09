import { describe, it, expect, vi, beforeEach } from "vitest";
import { placeOrder } from "./checkout";
import { db } from "@/lib/db";
import { applyStockDelta } from "@/lib/inventory";
import { redeemCoupon, CouponRedemptionRaceError } from "@/lib/storefront/coupon";
import { convert } from "@/lib/currency/convert";
import { StaleRateError } from "@/lib/payments/errors";
import { calculateShipping } from "@/lib/storefront/shipping";

const mockExecuteRaw = vi.fn();
const mockCartItemFindMany = vi.fn();
const mockCartItemDeleteMany = vi.fn();
const mockProductFindMany = vi.fn();
const mockAddressFindUnique = vi.fn();
const mockCouponFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockOrderItemCreate = vi.fn();
const mockInventoryLogCreate = vi.fn();
const mockOrderStatusHistoryCreate = vi.fn();
const mockPaymentCreate = vi.fn();

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
    orderStatusHistory: { create: mockOrderStatusHistoryCreate },
    payment: { create: mockPaymentCreate },
  };
}

// convert() is mocked wholesale here (never hits the DB) -- its own
// Decimal/ROUND_CEIL/stale-rate behavior is covered directly by
// src/lib/currency/convert.test.ts. Default behavior below mirrors the real
// identity-passthrough (USD) and a simple flat-rate stand-in (KES) so
// checkout tests can assert on the numbers they already expect.
vi.mock("@/lib/currency/convert", () => ({
  convert: vi.fn(),
}));

function defaultConvertImpl(amountUsd: { toNumber: () => number }, target: "USD" | "KES") {
  if (target === "USD") {
    return Promise.resolve({
      chargeAmount: { toNumber: () => amountUsd.toNumber() },
      chargeCurrency: "USD" as const,
      fxRate: null,
      fxRateAt: null,
    });
  }
  return Promise.resolve({
    chargeAmount: { toNumber: () => Math.ceil(amountUsd.toNumber() * 130) },
    chargeCurrency: "KES" as const,
    fxRate: { toNumber: () => 130 },
    fxRateAt: new Date("2026-01-01T00:00:00Z"),
  });
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

// calculateShipping is mocked so this suite can prove the order-total
// formula genuinely *sums* shippingUsd in (not just passes it through as an
// always-0 field, which the real HUB-41 stub happens to return today and
// would make a "shipping silently dropped from the total" bug invisible).
// Default mirrors the real stub (0) so every other test in this file is
// unaffected; the dedicated non-zero test below overrides it per-case.
vi.mock("@/lib/storefront/shipping", () => ({
  calculateShipping: vi.fn(),
}));

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

// Somalia address: EVC_PLUS/EDAHAB/CARD allowed, all WaafiPay/eDahab (USD) --
// none of these default tests route through Paystack/KES.
const ADDRESS = { id: "addr1", userId: "user-1", country: "SO" };

const BASE_INPUT = { addressId: "addr1", paymentMethod: "EVC_PLUS" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteRaw.mockResolvedValue(1);
  vi.mocked(applyStockDelta).mockResolvedValue(1);
  mockAddressFindUnique.mockResolvedValue(ADDRESS);
  mockOrderCreate.mockResolvedValue({ id: "order1", status: "PLACED" });
  mockOrderItemCreate.mockResolvedValue({ id: "oi1" });
  mockInventoryLogCreate.mockResolvedValue({ id: "log1" });
  mockOrderStatusHistoryCreate.mockResolvedValue({ id: "hist1" });
  mockCartItemDeleteMany.mockResolvedValue({ count: 1 });
  mockPaymentCreate.mockResolvedValue({ id: "pay1" });
  vi.mocked(convert).mockImplementation(defaultConvertImpl as never);
  vi.mocked(calculateShipping).mockReturnValue(0);
});

describe("placeOrder", () => {
  it("returns cart_empty when the user has no cart at all", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue(null);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "cart_empty" });
  });

  it("returns cart_empty when the cart has no items", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([]);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "cart_empty" });
  });

  it("returns product_unavailable when the product no longer exists", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "missing", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([]);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "product_unavailable" });
  });

  it("returns product_unavailable when the product is inactive", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([{ ...PRODUCT, isActive: false }]);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "product_unavailable" });
  });

  it("returns product_unavailable when a variantId no longer belongs to an active variant", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: "bad-variant", quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "product_unavailable" });
  });

  it("returns insufficient_stock when requested quantity exceeds available stock (pre-check)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 999 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", BASE_INPUT);

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

    const result = await placeOrder("user-1", BASE_INPUT);

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

    await placeOrder("user-1", BASE_INPUT);

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
    mockAddressFindUnique.mockResolvedValue({ id: "addr1", userId: "other-user", country: "SO" });

    const result = await placeOrder("user-1", BASE_INPUT);

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

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "address_not_found" });
  });

  it("rejects a payment method not allowed for the shipping country (Iron Rule #1)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    // Ethiopia only allows CARD, not MPESA.
    mockAddressFindUnique.mockResolvedValue({ id: "addr1", userId: "user-1", country: "ET" });

    const result = await placeOrder("user-1", { addressId: "addr1", paymentMethod: "MPESA" });

    expect(result).toEqual({ ok: false, error: "payment_method_not_allowed" });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("returns fx_rate_stale (and creates nothing) when convert() throws StaleRateError", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockAddressFindUnique.mockResolvedValue({ id: "addr1", userId: "user-1", country: "KE" });
    vi.mocked(convert).mockRejectedValueOnce(new StaleRateError("too old"));

    const result = await placeOrder("user-1", { addressId: "addr1", paymentMethod: "MPESA" });

    expect(result).toEqual({ ok: false, error: "fx_rate_stale" });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("resolves MPESA -> PAYSTACK -> KES via convert(), for a Kenyan address", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 2 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);
    mockAddressFindUnique.mockResolvedValue({ id: "addr1", userId: "user-1", country: "KE" });

    const result = await placeOrder("user-1", { addressId: "addr1", paymentMethod: "MPESA" });

    expect(result.ok).toBe(true);
    expect(convert).toHaveBeenCalledWith(expect.anything(), "KES");
    expect(mockPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gateway: "PAYSTACK",
        method: "MPESA",
        chargeCurrency: "KES",
      }),
    });
  });

  it("creates order+items+inventory logs and clears the cart on success (no coupon)", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 2 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({
      ok: true,
      orderId: "order1",
      subtotalUsd: 20,
      discountUsd: 0,
      taxUsd: 0,
      shippingUsd: 0,
      totalUsd: 20,
      chargeCurrency: "USD",
      chargeAmount: 20,
      fxRate: null,
    });

    expect(mockOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        subtotalUsd: 20,
        discountUsd: 0,
        taxUsd: 0,
        totalUsd: 20,
        chargeCurrency: "USD",
        fxRate: null,
        fxRateAt: null,
        shippingAddressId: "addr1",
        couponId: null,
        paymentMethod: "EVC_PLUS",
      }),
    });

    // HUB-40: the Payment row is created in the same transaction, using the
    // order's own id as gatewayReference, and resolves EVC_PLUS -> WAAFIPAY.
    expect(mockPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order1",
        gateway: "WAAFIPAY",
        method: "EVC_PLUS",
        gatewayReference: "order1",
        chargeCurrency: "USD",
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

    // HUB-39: the initial status-history row is written inside the same tx,
    // immediately after order creation -- never a second transaction.
    expect(mockOrderStatusHistoryCreate).toHaveBeenCalledWith({
      data: { orderId: "order1", status: "PLACED" },
    });
  });

  it("sums a non-zero shippingUsd into totalUsd/chargeAmount/Payment.amountUsd (proves the formula, not just field presence)", async () => {
    // If calculateShipping were dropped from the totalUsd/order-create/
    // payment-create formula, this would still assert shippingUsd: 7.5 came
    // back from the stub call but totalUsd would wrongly stay 20 instead of
    // 27.5 -- so this case, unlike the real $0 stub, actually fails on that
    // class of bug.
    vi.mocked(calculateShipping).mockReturnValue(7.5);
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 2 },
    ]);
    mockProductFindMany.mockResolvedValue([PRODUCT]);

    const result = await placeOrder("user-1", BASE_INPUT);

    expect(result).toEqual({
      ok: true,
      orderId: "order1",
      subtotalUsd: 20,
      discountUsd: 0,
      taxUsd: 0,
      shippingUsd: 7.5,
      totalUsd: 27.5,
      chargeCurrency: "USD",
      chargeAmount: 27.5,
      fxRate: null,
    });

    expect(mockOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ shippingUsd: 7.5, totalUsd: 27.5 }),
    });

    expect(mockPaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountUsd: 27.5 }),
    });
  });

  it("never trusts a client-supplied price -- unitPriceUsd always comes from the tx-fresh product read", async () => {
    vi.mocked(db.cart.findFirst).mockResolvedValue({ id: "cart1" } as never);
    mockCartItemFindMany.mockResolvedValue([
      { id: "ci1", productId: "p1", variantId: null, quantity: 1 },
    ]);
    mockProductFindMany.mockResolvedValue([{ ...PRODUCT, basePriceUsd: decimal(10) }]);

    await placeOrder("user-1", BASE_INPUT);

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

    const result = await placeOrder("user-1", { ...BASE_INPUT, couponCode: "SAVE5" });

    expect(result).toEqual({
      ok: true,
      orderId: "order1",
      subtotalUsd: 20,
      discountUsd: 5,
      taxUsd: 0,
      shippingUsd: 0,
      totalUsd: 15,
      chargeCurrency: "USD",
      chargeAmount: 15,
      fxRate: null,
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

    const result = await placeOrder("user-1", { ...BASE_INPUT, couponCode: "MISSING" });

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

    const result = await placeOrder("user-1", { ...BASE_INPUT, couponCode: "SAVE5" });

    expect(result).toEqual({ ok: false, error: "coupon_no_longer_valid" });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });
});
