/**
 * Unit tests for buildOrderTimeline (HUB-39, U14 / PRD R14, AC3/AC5).
 *
 * Pure function, no framework/DB dependency -- exercises the actual ordering
 * and cancellation-collapse logic that both the authenticated order-detail
 * page and the public tracking page render from.
 */
import { describe, it, expect } from "vitest";
import { buildOrderTimeline, ORDER_FLOW } from "./order-timeline";

function d(offsetMinutes: number): Date {
  return new Date(2026, 0, 1, 0, offsetMinutes);
}

describe("buildOrderTimeline", () => {
  it("returns all four flow stages with timestamp for reached stages and null for unreached, for an in-progress order", () => {
    const stages = buildOrderTimeline([
      { status: "PLACED", createdAt: d(0) },
      { status: "PROCESSING", createdAt: d(10) },
    ]);

    expect(stages.map((s) => s.status)).toEqual(["PLACED", "PROCESSING", "SHIPPED", "DELIVERED"]);
    expect(stages[0].timestamp).toEqual(d(0));
    expect(stages[1].timestamp).toEqual(d(10));
    expect(stages[2].timestamp).toBeNull();
    expect(stages[3].timestamp).toBeNull();
  });

  it("with only a single PLACED history row, shows PLACED reached and the remaining three stages as pending", () => {
    const stages = buildOrderTimeline([{ status: "PLACED", createdAt: d(0) }]);

    expect(stages).toHaveLength(4);
    expect(stages[0]).toEqual({ status: "PLACED", timestamp: d(0) });
    expect(stages.slice(1).every((s) => s.timestamp === null)).toBe(true);
  });

  it("marks all four stages reached, in order, for a fully DELIVERED order", () => {
    const stages = buildOrderTimeline([
      { status: "PLACED", createdAt: d(0) },
      { status: "PROCESSING", createdAt: d(10) },
      { status: "SHIPPED", createdAt: d(20) },
      { status: "DELIVERED", createdAt: d(30) },
    ]);

    expect(stages.map((s) => s.status)).toEqual(ORDER_FLOW as unknown as string[]);
    expect(stages.every((s) => s.timestamp !== null)).toBe(true);
  });

  it("for a CANCELLED order, shows only the stages actually reached before cancellation, then CANCELLED -- no future stages implied", () => {
    const stages = buildOrderTimeline([
      { status: "PLACED", createdAt: d(0) },
      { status: "PROCESSING", createdAt: d(10) },
      { status: "CANCELLED", createdAt: d(20) },
    ]);

    expect(stages.map((s) => s.status)).toEqual(["PLACED", "PROCESSING", "CANCELLED"]);
    // SHIPPED/DELIVERED must never appear for a cancelled order.
    expect(stages.some((s) => s.status === "SHIPPED" || s.status === "DELIVERED")).toBe(false);
    expect(stages[2].timestamp).toEqual(d(20));
  });

  it("for an order cancelled immediately after placement, shows just PLACED -> CANCELLED", () => {
    const stages = buildOrderTimeline([
      { status: "PLACED", createdAt: d(0) },
      { status: "CANCELLED", createdAt: d(5) },
    ]);

    expect(stages.map((s) => s.status)).toEqual(["PLACED", "CANCELLED"]);
  });

  it("keeps the first-reached timestamp if a status somehow repeats in history", () => {
    const stages = buildOrderTimeline([
      { status: "PLACED", createdAt: d(0) },
      { status: "PROCESSING", createdAt: d(10) },
      { status: "PROCESSING", createdAt: d(15) },
    ]);

    const processing = stages.find((s) => s.status === "PROCESSING");
    expect(processing?.timestamp).toEqual(d(10));
  });

  it("prepends PLACED when history is empty (defensive: never omit the first stage)", () => {
    const stages = buildOrderTimeline([]);

    expect(stages[0].status).toBe("PLACED");
    expect(stages[0].timestamp).toBeNull();
    expect(stages.map((s) => s.status)).toEqual(["PLACED", "PROCESSING", "SHIPPED", "DELIVERED"]);
  });

  it("prepends PLACED when history starts with CANCELLED only (no PLACED row ever recorded)", () => {
    const stages = buildOrderTimeline([{ status: "CANCELLED", createdAt: d(0) }]);

    expect(stages[0]).toEqual({ status: "PLACED", timestamp: null });
    expect(stages[stages.length - 1]).toEqual({ status: "CANCELLED", timestamp: d(0) });
  });
});
