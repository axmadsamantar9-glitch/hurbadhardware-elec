import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { validateCouponForSubtotal } from "@/lib/api/coupons";
import { db } from "@/lib/db";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/coupons", () => ({ validateCouponForSubtotal: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { coupon: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
}));

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/coupons/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/coupons/validate (HUR-190, U10)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("works without authentication (guest coupon preview)", async () => {
    vi.mocked(validateCouponForSubtotal).mockResolvedValue({ valid: false, reason: "not_found" });

    const res = await POST(makeRequest({ code: "SAVE10", subtotalUsd: 100 }) as never);

    expect(res.status).toBe(200);
  });

  it("returns the valid discount shape for a valid coupon", async () => {
    vi.mocked(validateCouponForSubtotal).mockResolvedValue({
      valid: true,
      type: "PERCENT",
      value: 10,
      discountUsd: 10,
    });

    const res = await POST(makeRequest({ code: "SAVE10", subtotalUsd: 100 }) as never);
    const json = await res.json();

    expect(json).toEqual({ valid: true, type: "PERCENT", value: 10, discountUsd: 10 });
  });

  it.each([
    ["not_found"],
    ["inactive"],
    ["expired"],
    ["usage_cap_reached"],
    ["minimum_order_not_met"],
  ])("passes through the %s invalid reason", async (reason) => {
    vi.mocked(validateCouponForSubtotal).mockResolvedValue({
      valid: false,
      reason: reason as never,
    });

    const res = await POST(makeRequest({ code: "X", subtotalUsd: 10 }) as never);
    const json = await res.json();

    expect(json).toEqual({ valid: false, reason });
  });

  it("returns 400 for a malformed body", async () => {
    const res = await POST(makeRequest({ code: "" }) as never);
    expect(res.status).toBe(400);
    expect(validateCouponForSubtotal).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-finite subtotal", async () => {
    const res = await POST(makeRequest({ code: "X", subtotalUsd: Infinity }) as never);
    expect(res.status).toBe(400);
    expect(validateCouponForSubtotal).not.toHaveBeenCalled();
  });

  it("NEVER mutates Coupon.usedCount across N calls — read-only by design (U10 scope)", async () => {
    vi.mocked(validateCouponForSubtotal).mockResolvedValue({
      valid: true,
      type: "FIXED",
      value: 5,
      discountUsd: 5,
    });

    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ code: "SAVE5", subtotalUsd: 50 }) as never);
    }

    expect(db.coupon.update).not.toHaveBeenCalled();
    expect(db.coupon.updateMany).not.toHaveBeenCalled();
  });
});
