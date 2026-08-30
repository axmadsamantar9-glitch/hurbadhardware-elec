/**
 * Live-database tests for HUB-29's core concurrency invariant.
 *
 * Deliberately does NOT mock `@/lib/db` — this file exercises `adjustStock()`
 * against the real dev Postgres database (see `.env` DATABASE_URL) to prove
 * PRD §52 invariant #3 ("inventory cannot oversell through concurrent
 * operations") holds under actual concurrent execution, not just sequential
 * mock calls (see `src/lib/inventory.test.ts` for the mocked unit tests).
 *
 * Creates a single throwaway Category + Product per test run and deletes
 * both in `afterAll` (Product -> InventoryLog cascades on delete per the
 * schema's `onDelete: Cascade`, so no manual InventoryLog cleanup is
 * needed). Never touches seed/demo data.
 *
 * Skips itself (rather than failing) when DATABASE_URL isn't configured in
 * the current environment, so this doesn't break `npm test` in a sandbox
 * with no DB access — but in this project's normal dev environment the
 * variable is present and the test runs for real.
 */

// vitest does not load `.env` itself (unlike `next dev`/`prisma` CLI, which
// both auto-load it) — without this, `process.env.DATABASE_URL` is empty
// under `npm test` and this whole suite silently no-ops via `describe.skip`
// below instead of actually exercising the DB. `dotenv/config` is already a
// transitive dependency (via prisma/next), so no new package is needed.
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("adjustStock — live concurrency (real DB)", () => {
  // Dynamic imports so this module (and its real `@/lib/db` PrismaClient)
  // is only ever loaded when we actually intend to hit the database.
  let db: typeof import("@/lib/db").db;
  let adjustStock: typeof import("./inventory").adjustStock;
  let adjustStockManual: typeof import("./inventory").adjustStockManual;
  let isLowStock: typeof import("./inventory").isLowStock;
  let InsufficientStockError: typeof import("./inventory").InsufficientStockError;

  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ adjustStock, adjustStockManual, isLowStock, InsufficientStockError } =
      await import("./inventory"));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const category = await db.category.create({
      data: {
        nameEn: `HUB-29 Test Category ${suffix}`,
        nameSo: `HUB-29 Test Category ${suffix}`,
        slug: `hub-29-test-category-${suffix}`,
      },
    });
    categoryId = category.id;

    const product = await db.product.create({
      data: {
        nameEn: `HUB-29 Test Product ${suffix}`,
        nameSo: `HUB-29 Test Product ${suffix}`,
        slug: `hub-29-test-product-${suffix}`,
        sku: `HUB29-${suffix}`,
        basePriceUsd: "9.99",
        stockQuantity: 0,
        categoryId,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (productId) {
      // Cascades to InventoryLog rows for this product (schema onDelete: Cascade).
      await db.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    if (categoryId) {
      await db.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it("allows exactly one of two concurrent decrements that would jointly oversell, and never leaves stock negative", async () => {
    // Reset to a known starting stock for this specific assertion.
    await db.product.update({ where: { id: productId }, data: { stockQuantity: 5 } });

    // Two concurrent calls, each decrementing by 4. Only one can succeed
    // without stock going negative (5 - 4 = 1 OK; 1 - 4 = -3 not OK).
    // Fired via Promise.allSettled so a rejection from one doesn't abort
    // the other — this is genuine concurrent execution against the real
    // DB connection pool, not two sequential awaits dressed up as one.
    const [resultA, resultB] = await Promise.allSettled([
      adjustStock({ productId, delta: -4, reason: "write_off" }),
      adjustStock({ productId, delta: -4, reason: "write_off" }),
    ]);

    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
    const rejected = outcomes.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);

    const finalProduct = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(finalProduct.stockQuantity).toBe(1);
    expect(finalProduct.stockQuantity).toBeGreaterThanOrEqual(0);

    // Exactly one InventoryLog row was written for this batch (the
    // rejected call must not have written one — atomicity of the
    // transaction, not just the SQL guard).
    const logs = await db.inventoryLog.findMany({ where: { productId, reason: "write_off" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(-4);
  }, 15000);

  it("under higher concurrency (5 competing decrements, only 2 affordable), affected rows never oversell", async () => {
    await db.product.update({ where: { id: productId }, data: { stockQuantity: 6 } });
    // Clear the log rows from the previous test for a clean count here.
    await db.inventoryLog.deleteMany({ where: { productId } });

    // 5 concurrent calls of -3 each: stock=6 can only ever afford 2 of
    // them (6 -> 3 -> 0); the other 3 must be rejected.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => adjustStock({ productId, delta: -3, reason: "write_off" }))
    );

    const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;
    const rejectedCount = results.filter((r) => r.status === "rejected").length;

    expect(fulfilledCount).toBe(2);
    expect(rejectedCount).toBe(3);

    const finalProduct = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(finalProduct.stockQuantity).toBe(0);
    expect(finalProduct.stockQuantity).toBeGreaterThanOrEqual(0);
  }, 15000);

  it("PRD scenario (PRD.md:1759): admin sets stock to 5 -> InventoryLog entry created, isLowStock reports true", async () => {
    await db.product.update({ where: { id: productId }, data: { stockQuantity: 20 } });
    await db.inventoryLog.deleteMany({ where: { productId } });

    const current = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const targetQuantity = 5;
    const delta = targetQuantity - current.stockQuantity;

    const log = await adjustStockManual({ productId, delta });

    expect(log.reason).toBe("manual_adjustment");
    expect(log.delta).toBe(delta);

    const updated = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(updated.stockQuantity).toBe(5);

    const dbLogs = await db.inventoryLog.findMany({ where: { productId } });
    expect(dbLogs).toHaveLength(1);
    expect(dbLogs[0]).toMatchObject({ reason: "manual_adjustment", delta });

    expect(isLowStock(updated.stockQuantity, 5)).toBe(true);
  }, 15000);
});
