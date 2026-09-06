/**
 * Tests for GET /api/payments/status/[orderId] (U12/U23, Iron Rule #2). All
 * DB access, auth, and the gateway adapter are mocked -- no live network call.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

const {
  mockPaymentFindFirst,
  mockTransaction,
  mockQueryStatus,
  mockGetGateway,
  mockSettlePayment,
} = vi.hoisted(() => ({
  mockPaymentFindFirst: vi.fn(),
  mockTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  mockQueryStatus: vi.fn(),
  mockGetGateway: vi.fn(),
  mockSettlePayment: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { payment: { findFirst: mockPaymentFindFirst }, $transaction: mockTransaction },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/payments/gateway", () => ({ getGateway: mockGetGateway }));
vi.mock("@/lib/payments/settle", () => ({ settlePayment: mockSettlePayment }));

import { GET } from "./route";
import { auth } from "@/auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(): Request {
  return new Request("http://localhost/api/payments/status/order-1");
}

function makeContext(orderId = "order-1") {
  return { params: Promise.resolve({ orderId }) };
}

describe("GET /api/payments/status/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGateway.mockReturnValue({ queryStatus: mockQueryStatus });
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 404 when ownership-scoped lookup finds nothing", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await GET(makeRequest(), makeContext());
    expect(res.status).toBe(404);
  });

  it("returns the persisted status directly when already terminal (no re-poll)", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "FAILED",
      gatewayTransactionId: null,
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });

    const res = await GET(makeRequest(), makeContext());
    const json = await res.json();

    expect(json.status).toBe("FAILED");
    expect(mockQueryStatus).not.toHaveBeenCalled();
  });

  it("live-polls via queryStatus for a PENDING payment and persists the authoritative result", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });
    mockQueryStatus.mockResolvedValue({
      status: "COMPLETED",
      gatewayTransactionId: "txn-1",
      raw: {},
    });

    const res = await GET(makeRequest(), makeContext());
    const json = await res.json();

    expect(mockQueryStatus).toHaveBeenCalledWith("order-1");
    expect(mockSettlePayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "pay-1" }),
      expect.objectContaining({ kind: "COMPLETED", gatewayTransactionId: "txn-1" })
    );
    expect(json.status).toBe("COMPLETED");
  });

  it("falls back to PENDING (never a 500) when queryStatus throws", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      gateway: "WAAFIPAY",
      gatewayReference: "order-1",
    });
    mockQueryStatus.mockRejectedValue(new Error("gateway down"));

    const res = await GET(makeRequest(), makeContext());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("PENDING");
  });
});
