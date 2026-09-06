/**
 * Tests for POST /api/payments/initiate (U12). All DB access, auth, and the
 * gateway adapter are mocked -- no live network call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import type { Session } from "next-auth";

const { mockPaymentFindFirst, mockPaymentUpdateMany, mockInitiatePayment, mockGetGateway } =
  vi.hoisted(() => ({
    mockPaymentFindFirst: vi.fn(),
    mockPaymentUpdateMany: vi.fn(),
    mockInitiatePayment: vi.fn(),
    mockGetGateway: vi.fn(),
  }));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { payment: { findFirst: mockPaymentFindFirst, updateMany: mockPaymentUpdateMany } },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/payments/gateway", () => ({ getGateway: mockGetGateway }));

import { POST } from "./route";
import { auth } from "@/auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const decimal = (n: number) => ({ toNumber: () => n });

describe("POST /api/payments/initiate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    mockGetGateway.mockReturnValue({ initiatePayment: mockInitiatePayment });
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ orderId: "order-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the order/payment doesn't belong to this user (ownership-scoped)", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({ orderId: "order-1" }));
    expect(res.status).toBe(404);
  });

  it("short-circuits with the persisted status when the payment is already terminal", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "COMPLETED",
      gatewayTransactionId: "txn-1",
      gateway: "WAAFIPAY",
      order: { shippingAddress: { phone: "+252611111111" } },
    });

    const res = await POST(makeRequest({ orderId: "order-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("COMPLETED");
    expect(mockInitiatePayment).not.toHaveBeenCalled();
  });

  it("calls adapter.initiatePayment and never returns COMPLETED synchronously (Iron Rule #2)", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      method: "EVC_PLUS",
      gatewayReference: "order-1",
      orderId: "order-1",
      amountUsd: decimal(10),
      chargeAmount: decimal(10),
      chargeCurrency: "USD",
      order: { shippingAddress: { phone: "+252611111111" } },
    });
    mockInitiatePayment.mockResolvedValue({
      ok: true,
      status: "PENDING",
      gatewayTransactionId: "txn-1",
      raw: {},
    });

    const res = await POST(makeRequest({ orderId: "order-1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("PENDING");
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", status: "PENDING" },
      data: { gatewayTransactionId: "txn-1" },
    });
  });

  it("returns 502 when the gateway rejects the initiate request", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      method: "EVC_PLUS",
      gatewayReference: "order-1",
      orderId: "order-1",
      amountUsd: decimal(10),
      chargeAmount: decimal(10),
      chargeCurrency: "USD",
      order: { shippingAddress: {} },
    });
    mockInitiatePayment.mockResolvedValue({
      ok: false,
      status: "FAILED",
      reason: "rejected",
      raw: {},
    });

    const res = await POST(makeRequest({ orderId: "order-1" }));
    expect(res.status).toBe(502);
  });

  it("returns 400 for a malformed body", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });
});
