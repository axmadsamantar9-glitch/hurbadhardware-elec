/**
 * Tests for src/lib/payments/reconcile.ts (U23, Iron Rule #2). settlePayment()
 * itself is exercised through the REAL implementation here (only its own
 * deps -- @/lib/inventory, @/lib/audit -- and @/lib/db are mocked) so the
 * guarded-update dedup behavior is proven end to end, not just assumed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPaymentFindMany,
  mockPaymentUpdateMany,
  mockOrderFindUnique,
  mockOrderUpdateMany,
  mockOrderUpdate,
  mockOrderStatusHistoryCreate,
  mockInventoryLogCreate,
  mockApplyStockDelta,
  mockWriteAuditLog,
  mockQueryStatus,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockPaymentFindMany: vi.fn(),
  mockPaymentUpdateMany: vi.fn(),
  mockOrderFindUnique: vi.fn(),
  mockOrderUpdateMany: vi.fn(),
  mockOrderUpdate: vi.fn(),
  mockOrderStatusHistoryCreate: vi.fn(),
  mockInventoryLogCreate: vi.fn(),
  mockApplyStockDelta: vi.fn(),
  mockWriteAuditLog: vi.fn(),
  mockQueryStatus: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));

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
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    payment: { findMany: mockPaymentFindMany, updateMany: mockPaymentUpdateMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(makeTx())),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mockLoggerWarn, error: mockLoggerError, info: vi.fn() },
}));
vi.mock("@/lib/inventory", () => ({ applyStockDelta: mockApplyStockDelta }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mockWriteAuditLog }));
vi.mock("@/lib/payments/gateway", () => ({
  getGateway: vi.fn(() => ({ queryStatus: mockQueryStatus })),
}));

import { reconcilePendingPayments, RECONCILE_MIN_AGE_MS, EXPIRY_AGE_MS } from "./reconcile";
import { settlePayment } from "./settle";

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    orderId: "order-1",
    status: "PENDING",
    gateway: "WAAFIPAY",
    gatewayReference: "order-1",
    createdAt: new Date(Date.now() - RECONCILE_MIN_AGE_MS - 60000),
    pollAttempts: 0,
    lastPolledAt: null,
    ...overrides,
  };
}

const ORDER_WITH_ITEMS = {
  id: "order-1",
  items: [{ productId: "p1", variantId: null, quantity: 1 }],
};

describe("reconcilePendingPayments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderFindUnique.mockResolvedValue(ORDER_WITH_ITEMS);
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderUpdate.mockResolvedValue({});
    mockOrderStatusHistoryCreate.mockResolvedValue({});
    mockInventoryLogCreate.mockResolvedValue({});
    mockApplyStockDelta.mockResolvedValue(1);
    mockWriteAuditLog.mockResolvedValue({});
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("pending -> completed: settles via settlePayment, no stock restoration", async () => {
    const payment = makePayment();
    mockPaymentFindMany.mockResolvedValue([payment]);
    mockQueryStatus.mockResolvedValue({
      status: "COMPLETED",
      gatewayTransactionId: "txn-1",
      raw: {},
    });

    const summary = await reconcilePendingPayments();

    expect(summary.completed).toBe(1);
    expect(mockApplyStockDelta).not.toHaveBeenCalled();
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PLACED" },
      data: { paymentStatus: "COMPLETED", status: "PROCESSING" },
    });
  });

  it("pending -> failed: settles via settlePayment AND restores stock", async () => {
    const payment = makePayment();
    mockPaymentFindMany.mockResolvedValue([payment]);
    mockQueryStatus.mockResolvedValue({ status: "FAILED", reason: "declined", raw: {} });

    const summary = await reconcilePendingPayments();

    expect(summary.failed).toBe(1);
    expect(mockApplyStockDelta).toHaveBeenCalledWith(expect.anything(), {
      productId: "p1",
      variantId: null,
      delta: 1,
    });
    expect(mockOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { paymentStatus: "FAILED", status: "CANCELLED" },
    });
  });

  it("pending older than 30min with a still-PENDING gateway status -> expired: stock restored + AuditLog row written", async () => {
    const payment = makePayment({ createdAt: new Date(Date.now() - EXPIRY_AGE_MS - 60000) });
    mockPaymentFindMany.mockResolvedValue([payment]);
    mockQueryStatus.mockResolvedValue({ status: "PENDING" });

    const summary = await reconcilePendingPayments();

    expect(summary.expired).toBe(1);
    expect(mockApplyStockDelta).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "order.payment_expired" })
    );
    expect(mockOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: { paymentStatus: "EXPIRED" },
    });
  });

  it("still-pending (not yet expired) payments are not settled -- just recorded as polled", async () => {
    const payment = makePayment();
    mockPaymentFindMany.mockResolvedValue([payment]);
    mockQueryStatus.mockResolvedValue({ status: "PENDING" });

    const summary = await reconcilePendingPayments();

    expect(summary.stillPending).toBe(1);
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: "PENDING" },
      data: { pollAttempts: { increment: 1 }, lastPolledAt: expect.any(Date) },
    });
    expect(mockApplyStockDelta).not.toHaveBeenCalled();
  });

  it("an already-non-pending payment never reaches terminal-state logic (excluded via the SQL where clause)", async () => {
    mockPaymentFindMany.mockResolvedValue([]);

    await reconcilePendingPayments();

    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
      })
    );
  });

  it("a gateway-unreachable queryStatus increments pollAttempts/lastPolledAt WITHOUT aborting the rest of the batch", async () => {
    const paymentA = makePayment({ id: "pay-a", orderId: "order-a", gatewayReference: "order-a" });
    const paymentB = makePayment({ id: "pay-b", orderId: "order-b", gatewayReference: "order-b" });
    mockPaymentFindMany.mockResolvedValue([paymentA, paymentB]);

    mockQueryStatus
      .mockRejectedValueOnce(new Error("gateway unreachable"))
      .mockResolvedValueOnce({ status: "COMPLETED", gatewayTransactionId: "txn-b", raw: {} });

    const summary = await reconcilePendingPayments();

    expect(summary.erroredPolls).toBe(1);
    expect(summary.completed).toBe(1);
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "pay-a", status: "PENDING" },
      data: { pollAttempts: { increment: 1 }, lastPolledAt: expect.any(Date) },
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "reconcile_poll_failed",
      expect.objectContaining({ paymentId: "pay-a" })
    );
  });

  it("callback-vs-cron race: whichever settlePayment call runs first wins, the second is a guarded no-op (stock restored exactly once)", async () => {
    const payment = makePayment();

    mockPaymentUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const tx = makeTx();

    const firstOutcome = await settlePayment(tx as never, payment as never, {
      kind: "FAILED",
      reason: "declined",
      raw: {},
    });
    const secondOutcome = await settlePayment(tx as never, payment as never, {
      kind: "FAILED",
      reason: "declined",
      raw: {},
    });

    expect(firstOutcome).toBe(true);
    expect(secondOutcome).toBe(false);
    expect(mockApplyStockDelta).toHaveBeenCalledTimes(1);
  });
});
