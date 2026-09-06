/**
 * Tests for POST /api/payments/callback/[gateway] (U12/U23, Iron Rules #2 and
 * #8). All DB access and gateway adapters are mocked -- no live network call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimiter } from "@/lib/middleware/rate-limit";

const {
  mockPaymentFindFirst,
  mockTransaction,
  mockQueryStatus,
  mockValidateCallback,
  mockGetGateway,
  mockSettlePayment,
} = vi.hoisted(() => ({
  mockPaymentFindFirst: vi.fn(),
  mockTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  mockQueryStatus: vi.fn(),
  mockValidateCallback: vi.fn(),
  mockGetGateway: vi.fn(),
  mockSettlePayment: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    payment: { findFirst: mockPaymentFindFirst },
    $transaction: mockTransaction,
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/payments/gateway", () => ({ getGateway: mockGetGateway }));
vi.mock("@/lib/payments/settle", () => ({ settlePayment: mockSettlePayment }));

import { POST } from "./route";

function makeRequest(body: string, headers: Record<string, string> = {}, gateway = "waafipay") {
  return {
    request: new Request(`http://localhost/api/payments/callback/${gateway}`, {
      method: "POST",
      headers,
      body,
    }),
    context: { params: Promise.resolve({ gateway }) },
  };
}

describe("POST /api/payments/callback/[gateway]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    mockGetGateway.mockReturnValue({
      queryStatus: mockQueryStatus,
      validateCallback: mockValidateCallback,
    });
    mockValidateCallback.mockReturnValue(true);
  });

  it("returns 400 for an unknown gateway", async () => {
    const { request, context } = makeRequest("{}", {}, "unknown");
    const res = await POST(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 401 and touches NO Prisma write when the signature is invalid", async () => {
    mockValidateCallback.mockReturnValue(false);
    const { request, context } = makeRequest(
      JSON.stringify({ params: { referenceId: "order-1" } }),
      { "x-webhook-signature": "bad" }
    );

    const res = await POST(request, context);

    expect(res.status).toBe(401);
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("is idempotent: a duplicate delivery for an already-non-PENDING payment is a no-op but still 200", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "COMPLETED",
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });
    const { request, context } = makeRequest(
      JSON.stringify({ params: { referenceId: "order-1" } })
    );

    const res = await POST(request, context);

    expect(res.status).toBe(200);
    expect(mockQueryStatus).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("ALWAYS calls queryStatus and persists ITS result, even when the raw body claims a different status (Iron Rule #2)", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });
    // The forged/mocked raw body claims APPROVED/success...
    const forgedBody = JSON.stringify({
      params: { referenceId: "order-1", state: "APPROVED" },
    });
    // ...but the authoritative server-side queryStatus says FAILED.
    mockQueryStatus.mockResolvedValue({ status: "FAILED", reason: "declined", raw: {} });

    const { request, context } = makeRequest(forgedBody);
    const res = await POST(request, context);

    expect(res.status).toBe(200);
    expect(mockQueryStatus).toHaveBeenCalledWith("order-1");
    expect(mockSettlePayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "pay-1" }),
      expect.objectContaining({ kind: "FAILED", reason: "declined" })
    );
  });

  it("returns 404 when no gatewayReference can be extracted and no matching Payment exists", async () => {
    mockPaymentFindFirst.mockResolvedValue(null);
    const { request, context } = makeRequest(
      JSON.stringify({ params: { referenceId: "order-missing" } })
    );

    const res = await POST(request, context);
    expect(res.status).toBe(404);
  });

  it("does not settle when queryStatus itself reports PENDING", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });
    mockQueryStatus.mockResolvedValue({ status: "PENDING" });

    const { request, context } = makeRequest(
      JSON.stringify({ params: { referenceId: "order-1" } })
    );
    const res = await POST(request, context);

    expect(res.status).toBe(200);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("still returns 200 (never a 5xx) when processing throws -- the cron will retry", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });
    mockQueryStatus.mockRejectedValue(new Error("gateway down"));

    const { request, context } = makeRequest(
      JSON.stringify({ params: { referenceId: "order-1" } })
    );
    const res = await POST(request, context);

    expect(res.status).toBe(200);
  });

  it("eDahab has no validateCallback -- any inbound hit is treated purely as a re-check hint", async () => {
    mockGetGateway.mockReturnValue({ queryStatus: mockQueryStatus }); // no validateCallback
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "EDAHAB",
      gatewayReference: "order-1",
    });
    mockQueryStatus.mockResolvedValue({ status: "PENDING" });

    const { context } = makeRequest("", {}, "edahab");
    const urlWithQuery = new Request(
      "http://localhost/api/payments/callback/edahab?reference=order-1",
      { method: "POST", body: "" }
    );
    const res = await POST(urlWithQuery, context);

    expect(res.status).toBe(200);
    expect(mockQueryStatus).toHaveBeenCalledWith("order-1");
  });
});
