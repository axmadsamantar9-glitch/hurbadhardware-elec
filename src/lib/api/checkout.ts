/**
 * Checkout / order-creation data layer (HUR-191, U11 / PRD R11, Iron Rules
 * #1 "Client Input Never Trusted for Price, Stock, Tax, Shipping" and #3
 * "Inventory Cannot Oversell Under Concurrency").
 *
 * placeOrder() is the single write path for creating an order: it re-reads
 * and re-prices the user's cart lines fresh inside its own db.$transaction
 * (never trusting any pre-transaction read, e.g. getCartLinesPriced,
 * which is advisory-only for building the review UI), re-validates stock,
 * decrements it via a guarded UPDATE, optionally redeems a coupon via
 * another guarded UPDATE, computes the order total server-side, verifies the
 * shipping address belongs to the acting user, and creates the
 * Order+OrderItem+InventoryLog rows -- all inside one transaction, so a
 * failure at any step rolls back everything (stock decrements included).
 *
 * Deliberately NOT built here (HUB-40 owns this later):
 *   - payment gateway integration/confirmation, Payment row creation
 *   - FX conversion beyond the minimal USD-passthrough (chargeCurrency:
 *     "USD", fxRate: null, fxRateAt: null)
 *   - WhatsApp/conversational checkout (R22)
 *   - order management/tracking post-creation (HUB-39)
 */

import { db } from "@/lib/db";
import { applyStockDelta } from "@/lib/inventory";
import { evaluateCoupon, redeemCoupon, CouponRedemptionRaceError } from "@/lib/storefront/coupon";
import { calculateTax } from "@/lib/storefront/tax";
import { roundMoney } from "@/lib/storefront/cart";

export type CheckoutErrorCode =
  | "cart_empty"
  | "address_not_found"
  | "product_unavailable"
  | "insufficient_stock"
  | "coupon_invalid"
  | "coupon_no_longer_valid";

export interface PlaceOrderInput {
  addressId: string;
  couponCode?: string;
}

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      subtotalUsd: number;
      discountUsd: number;
      taxUsd: number;
      totalUsd: number;
    }
  | { ok: false; error: CheckoutErrorCode; couponReason?: string };

/**
 * Internal control-flow error thrown from inside the transaction callback to
 * short-circuit with a distinguishable, non-generic reason. Caught once at
 * the top level of placeOrder() and translated into a PlaceOrderResult --
 * never leaks out of this module.
 */
class CheckoutFlowError extends Error {
  constructor(
    public readonly code: CheckoutErrorCode,
    public readonly couponReason?: string
  ) {
    super(`checkout failed: ${code}`);
    this.name = "CheckoutFlowError";
  }
}

interface ResolvedLine {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceUsd: number;
  nameEn: string;
  nameSo: string;
}

/** Deterministic sort key for guarded stock-decrement ordering (deadlock avoidance). */
function lineSortKey(line: Pick<ResolvedLine, "productId" | "variantId">): string {
  return line.variantId ?? line.productId;
}

/**
 * Place an order for userId from their current DB cart. Every price, tax,
 * shipping, and stock figure used to build the order is re-fetched fresh
 * from the DB inside the transaction -- no client-supplied value (including
 * anything read from a pre-checkout cart-review call) is ever trusted for
 * money or inventory math.
 */
export async function placeOrder(
  userId: string,
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const cart = await db.cart.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (!cart) return { ok: false, error: "cart_empty" };

  try {
    const orderResult = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cart.id}))`;

      const items = await tx.cartItem.findMany({ where: { cartId: cart.id } });
      if (items.length === 0) {
        throw new CheckoutFlowError("cart_empty");
      }

      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { variants: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const resolvedLines: ResolvedLine[] = [];
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product || !product.isActive) {
          throw new CheckoutFlowError("product_unavailable");
        }

        let unitPriceUsd: number;
        let availableStock: number;
        if (item.variantId) {
          const variant = product.variants.find((v) => v.id === item.variantId);
          if (!variant || !variant.isActive) {
            throw new CheckoutFlowError("product_unavailable");
          }
          unitPriceUsd = variant.priceUsd.toNumber();
          availableStock = variant.stockQuantity;
        } else {
          unitPriceUsd = product.basePriceUsd.toNumber();
          availableStock = product.stockQuantity;
        }

        if (item.quantity > availableStock) {
          throw new CheckoutFlowError("insufficient_stock");
        }

        resolvedLines.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceUsd,
          nameEn: product.nameEn,
          nameSo: product.nameSo,
        });
      }

      const sortedLines = [...resolvedLines].sort((a, b) =>
        lineSortKey(a) < lineSortKey(b) ? -1 : lineSortKey(a) > lineSortKey(b) ? 1 : 0
      );
      for (const line of sortedLines) {
        const affected = await applyStockDelta(tx, {
          productId: line.productId,
          variantId: line.variantId,
          delta: -line.quantity,
        });
        if (affected === 0) {
          throw new CheckoutFlowError("insufficient_stock");
        }
      }

      const address = await tx.address.findUnique({ where: { id: input.addressId } });
      if (!address || address.userId !== userId) {
        throw new CheckoutFlowError("address_not_found");
      }

      const subtotalUsd = roundMoney(
        resolvedLines.reduce((sum, l) => sum + l.unitPriceUsd * l.quantity, 0)
      );

      let discountUsd = 0;
      let couponId: string | null = null;
      if (input.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: input.couponCode } });
        const evaluation = evaluateCoupon(
          coupon
            ? {
                type: coupon.type,
                value: coupon.value.toNumber(),
                minOrderUsd: coupon.minOrderUsd ? coupon.minOrderUsd.toNumber() : null,
                maxUses: coupon.maxUses,
                usedCount: coupon.usedCount,
                expiresAt: coupon.expiresAt,
                isActive: coupon.isActive,
              }
            : null,
          subtotalUsd
        );

        if (!evaluation.valid) {
          throw new CheckoutFlowError("coupon_invalid", evaluation.reason);
        }

        discountUsd = evaluation.discountUsd;
        couponId = coupon!.id;
        await redeemCoupon(tx, coupon!.id);
      }

      const taxUsd = calculateTax(subtotalUsd);
      const totalUsd = roundMoney(subtotalUsd - discountUsd + taxUsd);

      const order = await tx.order.create({
        data: {
          userId,
          subtotalUsd,
          discountUsd,
          taxUsd,
          totalUsd,
          chargeCurrency: "USD",
          chargeAmount: totalUsd,
          fxRate: null,
          fxRateAt: null,
          shippingAddressId: address.id,
          couponId,
        },
      });

      for (const line of resolvedLines) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPriceUsd: line.unitPriceUsd,
            nameSnapshotEn: line.nameEn,
            nameSnapshotSo: line.nameSo,
          },
        });

        await tx.inventoryLog.create({
          data: {
            productId: line.productId,
            variantId: line.variantId,
            delta: -line.quantity,
            reason: "sale",
            referenceType: "order",
            referenceId: order.id,
            createdBy: null,
          },
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return {
        id: order.id,
        subtotalUsd,
        discountUsd,
        taxUsd,
        totalUsd,
      };
    });

    return {
      ok: true,
      orderId: orderResult.id,
      subtotalUsd: orderResult.subtotalUsd,
      discountUsd: orderResult.discountUsd,
      taxUsd: orderResult.taxUsd,
      totalUsd: orderResult.totalUsd,
    };
  } catch (error: unknown) {
    if (error instanceof CheckoutFlowError) {
      return { ok: false, error: error.code, couponReason: error.couponReason };
    }
    if (error instanceof CouponRedemptionRaceError) {
      return { ok: false, error: "coupon_no_longer_valid" };
    }
    throw error;
  }
}
