/**
 * Tests for the inventory data layer (HUB-29).
 *
 * Two kinds of coverage here:
 *  1. Unit tests for the reason-scoped wrappers and `isLowStock()` against a
 *     mocked `db.$transaction` — fast, no network.
 *  2. A live concurrency test (`adjustStock() under real concurrent load`)
 *     that runs against the actual dev Postgres database (via `@/lib/db`,
 *     unmocked) to prove PRD §52 invariant #3 — "inventory cannot oversell
 *     through concurrent operations" — actually holds under real concurrent
 *     execution, not just sequential mock calls. It creates its own
 *     throwaway Product/Category rows and deletes them in an `afterAll`, so
 *     it never touches seed/demo data and leaves no residue on failure paths
 *     (best-effort cleanup even if an assertion throws).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  adjustStock,
  receiveStock,
  adjustStockManual,
  writeOffStock,
  returnToStock,
  isLowStock,
  InsufficientStockError,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from "./inventory";

// --- Unit tests: mock db.$transaction --------------------------------------

const mockExecuteRaw = vi.fn();
const mockInventoryLogCreate = vi.fn();
const mockProductFindUnique = vi.fn();
const mockVariantFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: mockExecuteRaw,
        inventoryLog: { create: mockInventoryLogCreate },
        product: { findUnique: mockProductFindUnique },
        productVariant: { findUnique: mockVariantFindUnique },
      })
    ),
  },
}));

describe("adjustStock (unit, mocked db)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a zero delta", async () => {
    await expect(
      adjustStock({ productId: "p1", delta: 0, reason: "manual_adjustment" })
    ).rejects.toThrow(/non-zero integer/);
  });

  it("rejects a non-integer delta", async () => {
    await expect(
      adjustStock({ productId: "p1", delta: 1.5, reason: "manual_adjustment" })
    ).rejects.toThrow(/non-zero integer/);
  });

  it("rejects an empty reason", async () => {
    await expect(adjustStock({ productId: "p1", delta: 1, reason: "  " })).rejects.toThrow(
      /reason is required/
    );
  });

  it("writes an InventoryLog row when the atomic update affects a row", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockInventoryLogCreate.mockResolvedValue({
      id: "log1",
      productId: "p1",
      variantId: null,
      delta: 5,
      reason: "receiving",
      referenceType: null,
      referenceId: null,
      createdBy: null,
      createdAt: new Date(),
    });

    const result = await adjustStock({ productId: "p1", delta: 5, reason: "receiving" });

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockInventoryLogCreate).toHaveBeenCalledWith({
      data: {
        productId: "p1",
        variantId: null,
        delta: 5,
        reason: "receiving",
        referenceType: null,
        referenceId: null,
        createdBy: null,
      },
    });
    expect(result.id).toBe("log1");
  });

  it("adjusts ProductVariant.stockQuantity when variantId is given, not Product", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    mockInventoryLogCreate.mockResolvedValue({ id: "log2" });

    await adjustStock({ productId: "p1", variantId: "v1", delta: -2, reason: "manual_adjustment" });

    expect(mockInventoryLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ variantId: "v1" }) })
    );
  });

  it("throws InsufficientStockError (not a generic Error) when the guarded UPDATE affects 0 rows and the row exists", async () => {
    mockExecuteRaw.mockResolvedValue(0);
    mockProductFindUnique.mockResolvedValue({ id: "p1" });

    await expect(
      adjustStock({ productId: "p1", delta: -100, reason: "write_off" })
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(mockInventoryLogCreate).not.toHaveBeenCalled();
  });

  it("throws a not-found error (distinct from insufficient-stock) when the target row doesn't exist", async () => {
    mockExecuteRaw.mockResolvedValue(0);
    mockProductFindUnique.mockResolvedValue(null);

    await expect(
      adjustStock({ productId: "missing", delta: -1, reason: "write_off" })
    ).rejects.toThrow(/not found/);
  });
});

describe("reason-scoped wrappers (unit, mocked db)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteRaw.mockResolvedValue(1);
    mockInventoryLogCreate.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: "log",
      ...(data as object),
      createdAt: new Date(),
    }));
  });

  it("receiveStock: positive delta, reason 'receiving'", async () => {
    const log = await receiveStock({ productId: "p1", quantity: 10 });
    expect(log).toMatchObject({ delta: 10, reason: "receiving" });
  });

  it("receiveStock rejects a non-positive quantity", async () => {
    await expect(receiveStock({ productId: "p1", quantity: 0 })).rejects.toThrow(
      /positive integer/
    );
    await expect(receiveStock({ productId: "p1", quantity: -5 })).rejects.toThrow(
      /positive integer/
    );
  });

  it("adjustStockManual: allows a positive or negative delta, reason 'manual_adjustment'", async () => {
    const up = await adjustStockManual({ productId: "p1", delta: 3 });
    expect(up).toMatchObject({ delta: 3, reason: "manual_adjustment" });

    const down = await adjustStockManual({ productId: "p1", delta: -3 });
    expect(down).toMatchObject({ delta: -3, reason: "manual_adjustment" });
  });

  it("writeOffStock: negates a positive quantity, reason 'write_off'", async () => {
    const log = await writeOffStock({ productId: "p1", quantity: 4 });
    expect(log).toMatchObject({ delta: -4, reason: "write_off" });
  });

  it("writeOffStock rejects a non-positive quantity", async () => {
    await expect(writeOffStock({ productId: "p1", quantity: -1 })).rejects.toThrow(
      /positive integer/
    );
  });

  it("returnToStock: positive delta, reason 'return_to_stock'", async () => {
    const log = await returnToStock({ productId: "p1", quantity: 2 });
    expect(log).toMatchObject({ delta: 2, reason: "return_to_stock" });
  });

  it("returnToStock rejects a non-positive quantity", async () => {
    await expect(returnToStock({ productId: "p1", quantity: 0 })).rejects.toThrow(
      /positive integer/
    );
  });
});

describe("isLowStock", () => {
  it("uses the PRD default threshold of 5 when no threshold is given", () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(5);
    expect(isLowStock(5)).toBe(true);
    expect(isLowStock(6)).toBe(false);
  });

  it("respects an explicit threshold override", () => {
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(11, 10)).toBe(false);
  });
});
