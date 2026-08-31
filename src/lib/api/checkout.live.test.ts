/**
 * Live-database test for HUR-191's core concurrency invariant (Iron Rule
 * #3: "Inventory Cannot Oversell Under Concurrency").
 *
 * Deliberately does NOT mock `@/lib/db` -- mirrors
 * `src/lib/inventory.live.test.ts`'s precedent (HUB-29) of proving a
 * guarded-UPDATE-based concurrency invariant against the real dev Postgres
 * database, not just sequential mock calls. Here the invariant under test is
 * one level up the stack: two different users concurrently checking out
 * carts that would jointly oversell the last unit of a shared product must
 * result in exactly one successful order and one `insufficient_stock`
 * rejection -- proving `placeOrder()`'s guarded stock decrement (via
 * `applyStockDelta()`, inside its own transaction per checkout) is safe
 * under real concurrent execution.
 *
 * Creates its own throwaway Category/Product/User(x2)/Address(x2)/Cart(x2)
 * rows and deletes them all in `afterAll` (best-effort, never touches
 * seed/demo data).
 *
 * Skips itself when DATABASE_URL isn't configured, same as the HUB-29
 * precedent.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("placeOrder — live concurrency (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let placeOrder: typeof import("./checkout").placeOrder;

  let categoryId: string;
  let productId: string;
  let userAId: string;
  let userBId: string;
  let addressAId: string;
  let addressBId: string;
  let cartAId: string;
  let cartBId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ placeOrder } = await import("./checkout"));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const category = await db.category.create({
      data: {
        nameEn: `HUR-191 Test Category ${suffix}`,
        nameSo: `HUR-191 Test Category ${suffix}`,
        slug: `hur-191-test-category-${suffix}`,
      },
    });
    categoryId = category.id;

    const product = await db.product.create({
      data: {
        nameEn: `HUR-191 Test Product ${suffix}`,
        nameSo: `HUR-191 Test Product ${suffix}`,
        slug: `hur-191-test-product-${suffix}`,
        sku: `HUR191-${suffix}`,
        basePriceUsd: "9.99",
        stockQuantity: 1,
        categoryId,
      },
    });
    productId = product.id;

    const userA = await db.user.create({
      data: { email: `hur191-a-${suffix}@example.com` },
    });
    userAId = userA.id;
    const userB = await db.user.create({
      data: { email: `hur191-b-${suffix}@example.com` },
    });
    userBId = userB.id;

    const addressA = await db.address.create({
      data: {
        userId: userAId,
        fullName: "Test A",
        phone: `+25261${suffix.slice(-6)}`,
        addressLine1: "Street 1",
        city: "Mogadishu",
        country: "SO",
      },
    });
    addressAId = addressA.id;
    const addressB = await db.address.create({
      data: {
        userId: userBId,
        fullName: "Test B",
        phone: `+25262${suffix.slice(-6)}`,
        addressLine1: "Street 2",
        city: "Mogadishu",
        country: "SO",
      },
    });
    addressBId = addressB.id;

    const cartA = await db.cart.create({ data: { userId: userAId } });
    cartAId = cartA.id;
    await db.cartItem.create({
      data: { cartId: cartAId, productId, variantId: null, quantity: 1 },
    });

    const cartB = await db.cart.create({ data: { userId: userBId } });
    cartBId = cartB.id;
    await db.cartItem.create({
      data: { cartId: cartBId, productId, variantId: null, quantity: 1 },
    });
  });

  afterAll(async () => {
    // Orders/OrderItems/InventoryLogs cascade or SetNull per schema; delete
    // explicitly in dependency order to be safe regardless.
    await db.orderItem.deleteMany({ where: { productId } }).catch(() => undefined);
    await db.inventoryLog.deleteMany({ where: { productId } }).catch(() => undefined);
    await db.order
      .deleteMany({ where: { userId: { in: [userAId, userBId] } } })
      .catch(() => undefined);
    await db.cartItem
      .deleteMany({ where: { cartId: { in: [cartAId, cartBId] } } })
      .catch(() => undefined);
    await db.cart.deleteMany({ where: { id: { in: [cartAId, cartBId] } } }).catch(() => undefined);
    await db.address
      .deleteMany({ where: { id: { in: [addressAId, addressBId] } } })
      .catch(() => undefined);
    await db.product.delete({ where: { id: productId } }).catch(() => undefined);
    await db.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("allows exactly one of two concurrent checkouts to reserve the last unit", async () => {
    const [resultA, resultB] = await Promise.all([
      placeOrder(userAId, { addressId: addressAId }),
      placeOrder(userBId, { addressId: addressBId }),
    ]);

    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((r) => r.ok);
    const failed = outcomes.filter((r) => !r.ok);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ ok: false, error: "insufficient_stock" });

    const finalProduct = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(finalProduct.stockQuantity).toBe(0);
    expect(finalProduct.stockQuantity).toBeGreaterThanOrEqual(0);

    // Exactly one Order was created, and its cart was cleared.
    const orders = await db.order.findMany({ where: { userId: { in: [userAId, userBId] } } });
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("PLACED");
    expect(orders[0].paymentStatus).toBe("PENDING");

    const winningCartId = orders[0].userId === userAId ? cartAId : cartBId;
    const losingCartId = orders[0].userId === userAId ? cartBId : cartAId;
    const winningCartItems = await db.cartItem.findMany({ where: { cartId: winningCartId } });
    const losingCartItems = await db.cartItem.findMany({ where: { cartId: losingCartId } });
    expect(winningCartItems).toHaveLength(0);
    // The losing checkout's cart is untouched -- it never wrote an order.
    expect(losingCartItems).toHaveLength(1);
  }, 20000);
});
