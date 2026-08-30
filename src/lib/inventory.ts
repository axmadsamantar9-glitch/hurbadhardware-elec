/**
 * Inventory management data layer (HUB-29).
 *
 * `adjustStock()` is the single write path for stock changes: it atomically
 * writes an `InventoryLog` row and adjusts `Product.stockQuantity` (or
 * `ProductVariant.stockQuantity` when `variantId` is given) inside one DB
 * transaction, using a conditional atomic UPDATE so concurrent calls can
 * never drive stock negative (PRD §52 invariant #3). Every other exported
 * function in this module is a thin, reason-scoped wrapper around it — do
 * not write to `stockQuantity` or `InventoryLog` from anywhere else.
 *
 * Deliberately NOT built here (see HUB-29 ledger note — deferred):
 *   - reservation engine / `reservedQuantity` (HUB-37/38)
 *   - warehouse/location transfer logic (HUB-30)
 *   - admin UI, PO-linked receiving
 */

import { db } from "@/lib/db";
import type { InventoryLog } from "@/types/database";

/** Default low-stock threshold (PRD-specified), used whenever a caller does not override it. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Thrown by `adjustStock()` when applying `delta` would take stock negative.
 * Distinct from a generic Error so callers (e.g. checkout/receiving flows)
 * can catch it specifically to show "insufficient stock" UX rather than a
 * generic failure.
 */
export class InsufficientStockError extends Error {
  constructor(target: { productId: string; variantId?: string | null }, delta: number) {
    super(
      `adjustStock: applying delta ${delta} to ${
        target.variantId ? `variant ${target.variantId}` : `product ${target.productId}`
      } would make stock negative`
    );
    this.name = "InsufficientStockError";
  }
}

export interface AdjustStockParams {
  productId: string;
  /** When set, adjusts ProductVariant.stockQuantity instead of Product.stockQuantity. */
  variantId?: string | null;
  /** Signed change: negative decreases stock, positive increases it. Must be a non-zero integer. */
  delta: number;
  /** Free-text reason (matches AuditLog precedent — not an enum). */
  reason: string;
  /** Optional pointer to the entity that caused this adjustment (e.g. an order, a PO). */
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
}

/**
 * Atomically adjusts stock and records the change.
 *
 * Concurrency safety: the stock update is a single conditional SQL UPDATE
 * (`stock_quantity = stock_quantity + $delta WHERE ... AND stock_quantity +
 * $delta >= 0`), evaluated entirely inside Postgres — there is no
 * read-then-write gap in application code for a second concurrent
 * transaction to land in. If the WHERE clause's guard fails (would go
 * negative, or the row doesn't exist), zero rows are affected and this
 * throws instead of writing an InventoryLog row. Wrapped in
 * `db.$transaction` so the stock update and the InventoryLog insert commit
 * or roll back together.
 */
export async function adjustStock(params: AdjustStockParams): Promise<InventoryLog> {
  const { productId, variantId, delta, reason, referenceType, referenceId, createdBy } = params;

  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error("adjustStock: delta must be a non-zero integer");
  }
  if (!reason || !reason.trim()) {
    throw new Error("adjustStock: reason is required");
  }

  return db.$transaction(async (tx) => {
    const affected = variantId
      ? await tx.$executeRaw`UPDATE product_variants
          SET stock_quantity = stock_quantity + ${delta}
          WHERE id = ${variantId} AND stock_quantity + ${delta} >= 0`
      : await tx.$executeRaw`UPDATE products
          SET stock_quantity = stock_quantity + ${delta}
          WHERE id = ${productId} AND stock_quantity + ${delta} >= 0`;

    if (affected === 0) {
      // Distinguish "not found" from "would go negative" for a clearer error
      // — this read is purely for error-message quality, it does not gate
      // the write decision above (that guard already ran atomically).
      const exists = variantId
        ? await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true } })
        : await tx.product.findUnique({ where: { id: productId }, select: { id: true } });

      if (!exists) {
        throw new Error(
          `adjustStock: ${variantId ? `variant ${variantId}` : `product ${productId}`} not found`
        );
      }
      throw new InsufficientStockError({ productId, variantId }, delta);
    }

    return tx.inventoryLog.create({
      data: {
        productId,
        variantId: variantId ?? null,
        delta,
        reason,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        createdBy: createdBy ?? null,
      },
    });
  });
}

interface ReasonScopedParams {
  productId: string;
  variantId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
}

/** Restocking from a supplier/PO. `quantity` must be a positive integer; reason: "receiving". */
export async function receiveStock(
  params: ReasonScopedParams & { quantity: number }
): Promise<InventoryLog> {
  const { quantity, ...rest } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("receiveStock: quantity must be a positive integer");
  }
  return adjustStock({ ...rest, delta: quantity, reason: "receiving" });
}

/**
 * Ad hoc admin stock correction (e.g. cycle count, "set stock to N"). Unlike
 * the other wrappers, `delta` may be positive or negative — the caller is
 * responsible for computing it (e.g. `targetQuantity - currentQuantity`).
 * reason: "manual_adjustment".
 */
export async function adjustStockManual(
  params: ReasonScopedParams & { delta: number }
): Promise<InventoryLog> {
  return adjustStock({ ...params, reason: "manual_adjustment" });
}

/** Damaged/expired/lost stock leaving inventory. `quantity` must be a positive integer; reason: "write_off". */
export async function writeOffStock(
  params: ReasonScopedParams & { quantity: number }
): Promise<InventoryLog> {
  const { quantity, ...rest } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("writeOffStock: quantity must be a positive integer");
  }
  return adjustStock({ ...rest, delta: -quantity, reason: "write_off" });
}

/** Customer return going back into sellable stock. `quantity` must be a positive integer; reason: "return_to_stock". */
export async function returnToStock(
  params: ReasonScopedParams & { quantity: number }
): Promise<InventoryLog> {
  const { quantity, ...rest } = params;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("returnToStock: quantity must be a positive integer");
  }
  return adjustStock({ ...rest, delta: quantity, reason: "return_to_stock" });
}

/**
 * Whether `quantity` is at or below the low-stock threshold (PRD: default
 * 5). Pure data-layer helper — callers (product detail page, admin list)
 * derive the "low stock" badge from this rather than hardcoding `<= 5`
 * inline at each call site.
 */
export function isLowStock(
  quantity: number,
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD
): boolean {
  return quantity <= threshold;
}
