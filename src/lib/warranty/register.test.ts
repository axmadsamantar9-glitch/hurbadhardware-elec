import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerWarrantyForOrderItem, registerWarrantiesForDeliveredOrder } from "./register";
import type { Prisma } from "@prisma/client";

function makeTx() {
  return {
    orderItem: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    warranty: {
      upsert: vi.fn(),
    },
  } as unknown as Prisma.TransactionClient & {
    orderItem: { findUniqueOrThrow: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    warranty: { upsert: ReturnType<typeof vi.fn> };
  };
}

const BASE_ORDER_ITEM = {
  id: "item-1",
  orderId: "order-1",
  productId: "product-1",
  variantId: null,
  nameSnapshotEn: "Test Product",
  nameSnapshotSo: "Alaab Tijaabo",
  order: {
    userId: "user-1",
    statusHistory: [{ createdAt: new Date("2026-01-15T00:00:00.000Z") }],
  },
  product: { sku: "SKU-1", warrantyMonths: 12 },
};

describe("registerWarrantyForOrderItem (HUB-42 AC3/AC9)", () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    tx = makeTx();
    tx.orderItem.findUniqueOrThrow.mockResolvedValue(BASE_ORDER_ITEM);
    tx.warranty.upsert.mockResolvedValue({ id: "warranty-1" });
  });

  it("snapshots product name/sku/warrantyMonths and computes startDate from the DELIVERED status-history row", async () => {
    await registerWarrantyForOrderItem(tx, {
      orderItemId: "item-1",
      source: "MANUAL",
      registeredByUserId: "admin-1",
    });

    expect(tx.warranty.upsert).toHaveBeenCalledTimes(1);
    const call = tx.warranty.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ orderItemId: "item-1" });
    expect(call.create).toMatchObject({
      orderId: "order-1",
      orderItemId: "item-1",
      userId: "user-1",
      productId: "product-1",
      skuSnapshot: "SKU-1",
      productNameSnapshotEn: "Test Product",
      productNameSnapshotSo: "Alaab Tijaabo",
      warrantyMonthsSnapshot: 12,
      registrationSource: "MANUAL",
      registeredByUserId: "admin-1",
      status: "ACTIVE",
    });
    expect(call.create.startDate).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    expect(call.create.deliveryDate).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    // update is empty -- the idempotency guard never overwrites an existing row.
    expect(call.update).toEqual({});
  });

  it("is idempotent: calling it twice for the same order item issues two upserts with the same idempotency key, never a create-then-error", async () => {
    await registerWarrantyForOrderItem(tx, { orderItemId: "item-1", source: "AUTOMATIC" });
    await registerWarrantyForOrderItem(tx, { orderItemId: "item-1", source: "AUTOMATIC" });

    expect(tx.warranty.upsert).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = tx.warranty.upsert.mock.calls;
    expect(firstCall[0].where).toEqual({ orderItemId: "item-1" });
    expect(secondCall[0].where).toEqual({ orderItemId: "item-1" });
    // Both calls use `update: {}` -- a second call is a guaranteed no-op against
    // an already-registered warranty, never a duplicate-row error.
    expect(firstCall[0].update).toEqual({});
    expect(secondCall[0].update).toEqual({});
  });

  it("computes NOT_COVERED status when Product.warrantyMonths is null", async () => {
    tx.orderItem.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ORDER_ITEM,
      product: { sku: "SKU-1", warrantyMonths: null },
    });

    await registerWarrantyForOrderItem(tx, { orderItemId: "item-1", source: "AUTOMATIC" });

    const call = tx.warranty.upsert.mock.calls[0][0];
    expect(call.create.warrantyMonthsSnapshot).toBeNull();
    expect(call.create.status).toBe("NOT_COVERED");
    expect(call.create.expiryDate).toBeNull();
  });

  it("leaves deliveryDate/startDate/expiryDate null when there is no DELIVERED status-history row", async () => {
    tx.orderItem.findUniqueOrThrow.mockResolvedValue({
      ...BASE_ORDER_ITEM,
      order: { userId: "user-1", statusHistory: [] },
    });

    await registerWarrantyForOrderItem(tx, { orderItemId: "item-1", source: "AUTOMATIC" });

    const call = tx.warranty.upsert.mock.calls[0][0];
    expect(call.create.deliveryDate).toBeNull();
    expect(call.create.startDate).toBeNull();
    expect(call.create.expiryDate).toBeNull();
    expect(call.create.status).toBe("NOT_COVERED");
  });
});

describe("registerWarrantiesForDeliveredOrder", () => {
  it("registers a warranty (source AUTOMATIC) for every item on the order", async () => {
    const tx = makeTx();
    tx.orderItem.findMany.mockResolvedValue([{ id: "item-1" }, { id: "item-2" }]);
    tx.orderItem.findUniqueOrThrow.mockResolvedValue(BASE_ORDER_ITEM);
    tx.warranty.upsert.mockResolvedValue({ id: "warranty-x" });

    await registerWarrantiesForDeliveredOrder(tx, "order-1");

    expect(tx.orderItem.findMany).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      select: { id: true },
    });
    expect(tx.warranty.upsert).toHaveBeenCalledTimes(2);
    for (const call of tx.warranty.upsert.mock.calls) {
      expect(call[0].create.registrationSource).toBe("AUTOMATIC");
    }
  });
});
