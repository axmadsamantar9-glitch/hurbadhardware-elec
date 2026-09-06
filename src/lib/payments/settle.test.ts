/**
 * Tests for src/lib/payments/settle.ts (U23, Iron Rule #8). This is the one
 * shared side-effect path used by BOTH the webhook handler and the
 * reconciliation cron -- the guarded conditional UPDATE (WHERE status =
 * PENDING) is the dedup mechanism proven here directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payment } from "@prisma/client";
import { settlePayment } from "./settle";

const {
  mockPaymentUpdateMany,
  mockOrderFindUnique,
  mockOrderUpdateMany,
  mockOrderUpdate,
  mockOrderStatusHistoryCreate,
  mockApplyStockDelta,
  mockWriteAuditLog,
  mockInventoryLogCreate,
} = vi.hoisted(() => ({
  mockPaymentUpdateMany: vi.fn(),
  mockOrderFindUnique: vi.fn(),
  mockOrderUpdateMany: vi.fn(),
  mockOrderUpdate: vi.fn(),
  mockOrderStatusHistoryCreate: vi.fn(),
  mockApplyStockDelta: vi.fn(),
  mockWriteAuditLog: vi.fn(),
  mockInventoryLogCreate: vi.fn(),
}));

vi.mock("@/lib/inventory", () => ({ applyStockDelta: mockApplyStockDelta }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mockWriteAuditLog }));

function makeTx() {
  return {
    payment: { updateMany: mockPaymentUpdateMany },
    order: {
      findUnique: mockOrderFindUnique,
      updateMany: mockOrderUpdateMany,
      update: mockOrderUpdate,
    },
    orderStatusHistory: { create: mockOrderStatusHistoryCreate },
    inventoryLog: { create: mockInventoryLogCreate },
  } as never;
}

const BASE_PAYMENT: Payment = {
  id: "pay-1",
  orderId: "order-1",
  status: "PENDING",
} as unknown as Payment;

const ORDER_WITH_ITEMS = {
  id: "order-1",
  items: [
    { productId: "p1", variantId: null, quantity: 2 },
    { productId: null, variantId: null, quantity: 1 }, // no productId -- skipped
  ],
};

describe("settlePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderFindUnique.mockResolvedValue(ORDER_WITH_ITEMS);
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderUpdate.mockResolvedValue({});
    mockOrderStatusHistoryCreate.mockResolvedValue({});
    mockApplyStockDelta.mockResolvedValue(1);
    mockWriteAuditLog.mockResolvedValue({});
    mockInventoryLogCreate.mockResolvedValue({});
  });

  it("is a no-op (returns false) when the guarded UPDATE affects 0 rows -- duplicate delivery", async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });

    const won = await settlePayment(makeTx(), BASE_PAYMENT, {
      kind: "COMPLETED",
      gatewayTransactionId: "txn-1",
      raw: {},
    });

    expect(won).toBe(false);
    expect(mockOrderFindUnique).not.toHaveBeenCalled();
    expect(mockApplyStockDelta).not.toHaveBeenCalled();
  });

  it("COMPLETED: guarded UPDATE where status=PENDING, then marks order PROCESSING + history row", async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });

    const won = await settlePayment(makeTx(), BASE_PAYMENT, {
      kind: "COMPLETED",
      gatewayTransactionId: "txn-1",
      raw: { some: "raw" },
    });

    expect(won).toBe(true);
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: "PENDING" },
      data: expect.objectContaining({ status: "COMPLETED", gatewayTransactionId: "txn-1" }),
    });
    // The settle payload never carries a chargeAmount field at all -- proving
    // the gateways settled amount can never overwrite Payment.chargeAmount.
    const updateCall = mockPaymentUpdateMany.mock.calls[0][0];
    expect(Object.keys(updateCall.data)).not.toContain("chargeAmount");

    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PLACED" },
      data: { paymentStatus: "COMPLETED", status: "PROCESSING" },
    });
    expect(mockOrderStatusHistoryCreate).toHaveBeenCalledWith({
      data: { orderId: "order-1", status: "PROCESSING" },
    });
    expect(mockApplyStockDelta).not.toHaveBeenCalled();
  });

  it("COMPLETED: still records paymentStatus when order already moved past PLACED", async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderUpdateMany.mockResolvedValueOnce({ count: 0 });

    await settlePayment(makeTx(), BASE_PAYMENT, {
      kind: "COMPLETED",
      gatewayTransactionId: "txn-1",
      raw: {},
    });

    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { paymentStatus: "COMPLETED" },
    });
    expect(mockOrderStatusHistoryCreate).not.toHaveBeenCalled();
  });

  it("FAILED: order maps to CANCELLED, stock restored for each item with a productId", async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });

    const won = await settlePayment(makeTx(), BASE_PAYMENT, {
      kind: "FAILED",
      reason: "declined",
      raw: {},
    });

    expect(won).toBe(true);
    expect(mockOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { paymentStatus: "FAILED", status: "CANCELLED" },
    });
    expect(mockOrderStatusHistoryCreate).toHaveBeenCalledWith({
      data: { orderId: "order-1", status: "CANCELLED" },
    });
    // Only the one item with a productId gets its stock restored.
    expect(mockApplyStockDelta).toHaveBeenCalledTimes(1);
    expect(mockApplyStockDelta).toHaveBeenCalledWith(expect.anything(), {
      productId: "p1",
      variantId: null,
      delta: 2,
    });
  });

  it("EXPIRED: stock restored, order flagged paymentStatus=EXPIRED, AuditLog row written, Order.status untouched", async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });

    const won = await settlePayment(makeTx(), BASE_PAYMENT, { kind: "EXPIRED" });

    expect(won).toBe(true);
    expect(mockOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { paymentStatus: "EXPIRED" },
    });
    expect(mockApplyStockDelta).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "order.payment_expired",
        entityType: "order",
        entityId: "order-1",
      })
    );
    // Deliberately no Order.status transition -- customer is not auto-cancelled.
    expect(mockOrderUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: expect.anything() }) })
    );
  });

  it("returns true (no side effects) when the order itself cannot be found", async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderFindUnique.mockResolvedValue(null);

    const won = await settlePayment(makeTx(), BASE_PAYMENT, { kind: "EXPIRED" });

    expect(won).toBe(true);
    expect(mockApplyStockDelta).not.toHaveBeenCalled();
  });
});
