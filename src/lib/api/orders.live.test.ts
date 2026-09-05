/**
 * Live-database test for order-management reads (HUB-39, U14 / PRD R14).
 *
 * Deliberately does NOT mock `@/lib/db` -- mirrors
 * src/lib/api/checkout.live.test.ts's precedent of proving the real
 * ownership-scoped and email-matched query shapes against the actual dev
 * Postgres database, not just mock call assertions. In particular this
 * proves:
 *   - getOrderDetailForUser()'s ownership check lives in the `where` clause
 *     (a different user's order id returns `null`, identically to a
 *     nonexistent id -- AC2).
 *   - trackOrder()'s zero-match cases (wrong email, wrong suffix) all
 *     return `null` uniformly (AC5, Iron Rule #6).
 *
 * Creates its own throwaway User/Address/Order/OrderItem/OrderStatusHistory
 * rows and deletes them all in `afterAll` (best-effort, never touches
 * seed/demo data). Skips itself when DATABASE_URL isn't configured, same as
 * the HUR-191 precedent.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("order-management reads — live (real DB)", () => {
  let db: typeof import("@/lib/db").db;
  let getOrdersForUser: typeof import("./orders").getOrdersForUser;
  let getOrderDetailForUser: typeof import("./orders").getOrderDetailForUser;
  let trackOrder: typeof import("./orders").trackOrder;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ownerUserId: string;
  let otherUserId: string;
  let addressId: string;
  let orderId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ getOrdersForUser, getOrderDetailForUser, trackOrder } = await import("./orders"));

    const owner = await db.user.create({
      data: { email: `hub39-owner-${suffix}@example.com`, role: "CUSTOMER" },
    });
    ownerUserId = owner.id;

    const other = await db.user.create({
      data: { email: `hub39-other-${suffix}@example.com`, role: "CUSTOMER" },
    });
    otherUserId = other.id;

    const address = await db.address.create({
      data: {
        userId: ownerUserId,
        fullName: "HUB-39 Test User",
        phone: "+252611000000",
        addressLine1: "123 Test St",
        city: "Mogadishu",
        country: "SO",
      },
    });
    addressId = address.id;

    const order = await db.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          userId: ownerUserId,
          subtotalUsd: 20,
          discountUsd: 0,
          taxUsd: 0,
          totalUsd: 20,
          chargeCurrency: "USD",
          chargeAmount: 20,
          shippingAddressId: addressId,
          paymentMethod: "EVC_PLUS",
          status: "SHIPPED",
          trackingNumber: `TRK-${suffix}`,
        },
      });
      await tx.orderItem.create({
        data: {
          orderId: o.id,
          quantity: 2,
          unitPriceUsd: 10,
          nameSnapshotEn: "HUB-39 Widget",
          nameSnapshotSo: "HUB-39 Widget SO",
        },
      });
      await tx.orderStatusHistory.create({ data: { orderId: o.id, status: "PLACED" } });
      await tx.orderStatusHistory.create({ data: { orderId: o.id, status: "PROCESSING" } });
      await tx.orderStatusHistory.create({ data: { orderId: o.id, status: "SHIPPED" } });
      return o;
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await db.orderStatusHistory.deleteMany({ where: { orderId } });
    await db.orderItem.deleteMany({ where: { orderId } });
    await db.order.deleteMany({ where: { id: orderId } });
    await db.address.deleteMany({ where: { id: addressId } });
    await db.user.deleteMany({ where: { id: { in: [ownerUserId, otherUserId] } } });
  });

  it("getOrdersForUser lists the owner's order newest-first with item count and total", async () => {
    const orders = await getOrdersForUser(ownerUserId);
    const found = orders.find((o) => o.id === orderId);
    expect(found).toBeDefined();
    expect(found?.itemCount).toBe(2);
    expect(found?.totalUsd).toBe(20);
    expect(found?.status).toBe("SHIPPED");
  });

  it("getOrdersForUser returns no rows for a user with no orders", async () => {
    const orders = await getOrdersForUser(otherUserId);
    expect(orders.find((o) => o.id === orderId)).toBeUndefined();
  });

  it("getOrderDetailForUser returns full detail (items, address, tracking, timeline) for the owner", async () => {
    const detail = await getOrderDetailForUser(ownerUserId, orderId);
    expect(detail).not.toBeNull();
    expect(detail?.trackingNumber).toBe(`TRK-${suffix}`);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0].nameSnapshotEn).toBe("HUB-39 Widget");
    expect(detail?.shippingAddress?.city).toBe("Mogadishu");
    expect(detail?.statusHistory.map((h) => h.status)).toEqual(["PLACED", "PROCESSING", "SHIPPED"]);
  });

  it("getOrderDetailForUser returns null when a different user requests the same order id (ownership scoped in WHERE)", async () => {
    const detail = await getOrderDetailForUser(otherUserId, orderId);
    expect(detail).toBeNull();
  });

  it("getOrderDetailForUser returns null for a nonexistent order id (same shape as ownership mismatch)", async () => {
    const detail = await getOrderDetailForUser(ownerUserId, "nonexistent-order-id");
    expect(detail).toBeNull();
  });

  it("trackOrder returns the reduced public shape when suffix + email both match", async () => {
    const suffix4 = orderId.slice(-4);
    const result = await trackOrder(suffix4, `hub39-owner-${suffix}@example.com`);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(orderId);
    expect(result?.trackingNumber).toBe(`TRK-${suffix}`);
    expect(result?.items).toEqual([
      { nameSnapshotEn: "HUB-39 Widget", nameSnapshotSo: "HUB-39 Widget SO", quantity: 2 },
    ]);
    expect(result?.statusHistory).toHaveLength(3);
    expect(result?.totals).toEqual({
      subtotalUsd: 20,
      discountUsd: 0,
      taxUsd: 0,
      totalUsd: 20,
    });
  });

  it("trackOrder is case-insensitive on email", async () => {
    const suffix4 = orderId.slice(-4);
    const result = await trackOrder(suffix4, `HUB39-OWNER-${suffix}@EXAMPLE.COM`);
    expect(result?.id).toBe(orderId);
  });

  it("trackOrder returns null when the suffix matches but the email doesn't", async () => {
    const suffix4 = orderId.slice(-4);
    const result = await trackOrder(suffix4, "wrong@example.com");
    expect(result).toBeNull();
  });

  it("trackOrder returns null when no order id ends with the given suffix", async () => {
    const result = await trackOrder("zzzz", `hub39-owner-${suffix}@example.com`);
    expect(result).toBeNull();
  });
});
