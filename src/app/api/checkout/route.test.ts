import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { placeOrder } from "@/lib/api/checkout";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api/checkout", () => ({
  placeOrder: vi.fn(),
}));

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/checkout (HUR-191)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await POST(makeRequest({ addressId: "addr1", paymentMethod: "EVC_PLUS" }));

    expect(res.status).toBe(401);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("places an order for the session user, ignoring any client-supplied userId or price fields", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({
      ok: true,
      orderId: "order1",
      subtotalUsd: 20,
      discountUsd: 0,
      taxUsd: 0,
      // Non-zero on purpose: with a real $0 shippingUsd, a route handler
      // that forgot to serialize the field at all would still pass a
      // `toMatchObject`/`toBe(0)` check (missing key vs 0 both look falsy
      // in casual assertions). A non-zero value here forces the response
      // JSON to actually carry the field through.
      shippingUsd: 4.25,
      totalUsd: 24.25,
      chargeCurrency: "USD",
      chargeAmount: 24.25,
      fxRate: null,
    });

    const res = await POST(
      makeRequest({
        addressId: "addr1",
        paymentMethod: "EVC_PLUS",
        userId: "attacker-supplied-id",
        totalUsd: 0.01,
      })
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({
      ok: true,
      orderId: "order1",
      shippingUsd: 4.25,
      totalUsd: 24.25,
      chargeCurrency: "USD",
    });
    // Only the session-derived id and the Zod-validated field set (addressId,
    // paymentMethod, couponCode) are ever passed through.
    expect(placeOrder).toHaveBeenCalledWith("user-1", {
      addressId: "addr1",
      paymentMethod: "EVC_PLUS",
    });
  });

  it("maps address_not_found to a 404", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({ ok: false, error: "address_not_found" });

    const res = await POST(makeRequest({ addressId: "not-mine", paymentMethod: "EVC_PLUS" }));

    expect(res.status).toBe(404);
  });

  it("maps insufficient_stock to a 409", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({ ok: false, error: "insufficient_stock" });

    const res = await POST(makeRequest({ addressId: "addr1", paymentMethod: "EVC_PLUS" }));

    expect(res.status).toBe(409);
  });

  it("maps coupon_no_longer_valid (redemption race) to a 409", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({ ok: false, error: "coupon_no_longer_valid" });

    const res = await POST(
      makeRequest({ addressId: "addr1", paymentMethod: "EVC_PLUS", couponCode: "SAVE5" })
    );

    expect(res.status).toBe(409);
  });

  it("maps payment_method_not_allowed to a 400", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({ ok: false, error: "payment_method_not_allowed" });

    const res = await POST(makeRequest({ addressId: "addr1", paymentMethod: "MPESA" }));

    expect(res.status).toBe(400);
  });

  it("maps fx_rate_stale to a 503", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({ ok: false, error: "fx_rate_stale" });

    const res = await POST(makeRequest({ addressId: "addr1", paymentMethod: "MPESA" }));

    expect(res.status).toBe(503);
  });

  it("maps cart_empty to a 400", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(placeOrder).mockResolvedValue({ ok: false, error: "cart_empty" });

    const res = await POST(makeRequest({ addressId: "addr1", paymentMethod: "EVC_PLUS" }));

    expect(res.status).toBe(400);
  });

  describe("rate limiting", () => {
    it("returns 429 once the checkout-specific per-user threshold is exceeded", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(placeOrder).mockResolvedValue({
        ok: true,
        orderId: "order1",
        subtotalUsd: 20,
        discountUsd: 0,
        taxUsd: 0,
        shippingUsd: 0,
        totalUsd: 20,
        chargeCurrency: "USD",
        chargeAmount: 20,
        fxRate: null,
      });

      const { RATE_LIMIT_THRESHOLDS } = await import("@/lib/config/rate-limits");
      for (let i = 0; i < RATE_LIMIT_THRESHOLDS.CHECKOUT; i++) {
        await POST(makeRequest({ addressId: "addr1", paymentMethod: "EVC_PLUS" }));
      }
      const res = await POST(makeRequest({ addressId: "addr1", paymentMethod: "EVC_PLUS" }));

      expect(res.status).toBe(429);
    });
  });
});
