/**
 * Tests for src/lib/payments/admin.ts (U23, AC10). DB access is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindMany, mockCount } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { payment: { findMany: mockFindMany, count: mockCount } },
}));

import { listPaymentsForReview } from "./admin";

const decimal = (n: number) => ({ toNumber: () => n });

describe("listPaymentsForReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("defaults to page 1, pageSize 25 when unspecified", async () => {
    await listPaymentsForReview();
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
  });

  it("falls back to defaults for non-positive page/pageSize inputs", async () => {
    await listPaymentsForReview({ page: 0, pageSize: -5 });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
  });

  it("computes skip from page/pageSize correctly", async () => {
    await listPaymentsForReview({ page: 3, pageSize: 10 });
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
  });

  it("queries PENDING, EXPIRED, and recent FAILED payments only", async () => {
    await listPaymentsForReview();
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { status: "PENDING" },
        { status: "EXPIRED" },
        expect.objectContaining({ status: "FAILED" }),
      ])
    );
  });

  it("maps Decimal fields to plain numbers in the result rows", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "pay-1",
        orderId: "order-1",
        gateway: "WAAFIPAY",
        method: "EVC_PLUS",
        status: "PENDING",
        chargeAmount: decimal(19.99),
        chargeCurrency: "USD",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        pollAttempts: 2,
        lastPolledAt: null,
        order: { status: "PLACED", totalUsd: decimal(19.99) },
      },
    ]);
    mockCount.mockResolvedValue(1);

    const result = await listPaymentsForReview();

    expect(result.rows[0]).toMatchObject({
      id: "pay-1",
      chargeAmount: 19.99,
      orderTotalUsd: 19.99,
      orderStatus: "PLACED",
    });
    expect(result.total).toBe(1);
  });
});
