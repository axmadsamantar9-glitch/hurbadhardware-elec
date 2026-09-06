/**
 * Live-database test for settlePayment()'s callback-vs-cron race guarantee
 * (HUB-40, Iron Rule #8). Mirrors the precedent set by
 * `src/lib/inventory.live.test.ts` (HUB-29) and
 * `src/lib/api/checkout.live.test.ts` (HUR-191): the mocked unit tests in
 * `settle.test.ts`/`reconcile.test.ts` simulate the race by scripting a
 * mocked `payment.updateMany` to return count:1 then count:0 -- that proves
 * the application-level branching logic, but NOT that the underlying guarded
 * UPDATE (`WHERE status = 'PENDING'`) actually serializes two genuinely
 * concurrent writers against the real database. This file does NOT mock
 * `@/lib/db` -- it fires two real concurrent transactions at the same
 * Payment row via `Promise.all` and asserts the outcome against real Postgres
 * state (not mock call counts): exactly one call wins, stock is restored
 * exactly once (counted via a real InventoryLog query), and there is exactly
 * one OrderStatusHistory row for the transition -- not "no error thrown".
 *
 * Skips itself when DATABASE_URL isn't configured, same as the HUB-29/
 * HUR-191 precedents.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("settlePayment — callback-vs-cron live concurrency (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let settlePayment: typeof import("./settle").settlePayment;

  let categoryId: string;
  let productId: string;
  let userId: string;
  let addressId: string;
  let orderId: string;
  let paymentId: string;

  const QUANTITY = 3;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ settlePayment } = await import("./settle"));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const category = await db.category.create({
      data: {
        nameEn: `HUB-40 Test Category ${suffix}`,
        nameSo: `HUB-40 Test Category ${suffix}`,
        slug: `hub-40-test-category-${suffix}`,
      },
    });
    categoryId = category.id;

    const product = await db.product.create({
      data: {
        nameEn: `HUB-40 Test Product ${suffix}`,
        nameSo: `HUB-40 Test Product ${suffix}`,
        slug: `hub-40-test-product-${suffix}`,
        sku: `HUB40-${suffix}`,
        basePriceUsd: "9.99",
        stockQuantity: 0,
        categoryId,
      },
    });
    productId = product.id;

    const user = await db.user.create({
      data: { email: `hub40-${suffix}@example.com` },
    });
    userId = user.id;

    const address = await db.address.create({
      data: {
        userId,
        fullName: "Test HUB-40",
        phone: `+25261${suffix.slice(-6)}`,
        addressLine1: "Street 1",
        city: "Mogadishu",
        country: "SO",
      },
    });
    addressId = address.id;

    const order = await db.order.create({
      data: {
        userId,
        status: "PLACED",
        subtotalUsd: "29.97",
        totalUsd: "29.97",
        chargeCurrency: "USD",
        chargeAmount: "29.97",
        shippingAddressId: addressId,
        paymentMethod: "EVC_PLUS",
        paymentStatus: "PENDING",
        items: {
          create: [
            {
              productId,
              variantId: null,
              quantity: QUANTITY,
              unitPriceUsd: "9.99",
              nameSnapshotEn: "HUB-40 Test Product",
              nameSnapshotSo: "HUB-40 Test Product",
            },
          ],
        },
      },
    });
    orderId = order.id;

    const payment = await db.payment.create({
      data: {
        orderId,
        gateway: "WAAFIPAY",
        method: "EVC_PLUS",
        gatewayReference: `hub40-ref-${suffix}`,
        amountUsd: "29.97",
        chargeAmount: "29.97",
        chargeCurrency: "USD",
        status: "PENDING",
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await db.inventoryLog.deleteMany({ where: { productId } }).catch(() => undefined);
    await db.orderStatusHistory.deleteMany({ where: { orderId } }).catch(() => undefined);
    await db.payment.deleteMany({ where: { orderId } }).catch(() => undefined);
    await db.orderItem.deleteMany({ where: { orderId } }).catch(() => undefined);
    await db.order.delete({ where: { id: orderId } }).catch(() => undefined);
    await db.address.delete({ where: { id: addressId } }).catch(() => undefined);
    await db.product.delete({ where: { id: productId } }).catch(() => undefined);
    await db.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("two concurrent settlePayment(FAILED) calls against the same real Payment row: exactly one wins, stock restored exactly once", async () => {
    const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });

    // Two genuinely concurrent transactions racing the guarded UPDATE --
    // fired via Promise.all against the real connection pool, not two
    // sequential awaits.
    const [resultA, resultB] = await Promise.all([
      db.$transaction((tx) =>
        settlePayment(tx, payment, { kind: "FAILED", reason: "declined", raw: {} })
      ),
      db.$transaction((tx) =>
        settlePayment(tx, payment, { kind: "FAILED", reason: "declined", raw: {} })
      ),
    ]);

    const outcomes = [resultA, resultB];
    const won = outcomes.filter((r) => r === true);
    const lost = outcomes.filter((r) => r === false);

    // The application-level return values: exactly one caller's guarded
    // UPDATE actually affected a row.
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // Real DB state, not mock call counts: stock restored exactly once
    // (QUANTITY units), never twice (2 * QUANTITY would indicate a
    // double-apply bug).
    const finalProduct = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(finalProduct.stockQuantity).toBe(QUANTITY);

    // Exactly one InventoryLog row was written for this payment failure --
    // a real count query against Postgres, not "no error thrown".
    const logs = await db.inventoryLog.findMany({
      where: { productId, reason: "order_payment_failed" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(QUANTITY);

    // Exactly one OrderStatusHistory CANCELLED row -- the losing caller's
    // guarded update was a true no-op, not a second write that happened to
    // agree with the first.
    const history = await db.orderStatusHistory.findMany({
      where: { orderId, status: "CANCELLED" },
    });
    expect(history).toHaveLength(1);

    const finalPayment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(finalPayment.status).toBe("FAILED");

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(finalOrder.paymentStatus).toBe("FAILED");
    expect(finalOrder.status).toBe("CANCELLED");
  }, 20000);
});
