/**
 * Tests for GET /api/admin/payments (HUB-40, U23 AC10). The underlying data
 * layer (listPaymentsForReview) already has full unit coverage in
 * src/lib/payments/admin.test.ts -- this file covers the route handler's own
 * responsibilities: the auth gate (401/403, same pattern as
 * src/app/api/admin/uploads/presign/route.ts), rate limiting, and the
 * generic-500 error envelope.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { listPaymentsForReview } from "@/lib/payments/admin";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/payments/admin", () => ({ listPaymentsForReview: vi.fn() }));

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "admin@hurbad.com", role: "ADMIN" as const },
};
const CUSTOMER_SESSION = {
  user: { id: "cust-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(url = "http://localhost/api/admin/payments"): Request {
  return new Request(url);
}

describe("GET /api/admin/payments (HUB-40)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    vi.mocked(listPaymentsForReview).mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(listPaymentsForReview).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated but not ADMIN", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(listPaymentsForReview).not.toHaveBeenCalled();
  });

  it("returns the review list for an ADMIN session", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(listPaymentsForReview).mockResolvedValue({
      rows: [
        {
          id: "pay-1",
          orderId: "order-1",
          gateway: "WAAFIPAY",
          method: "EVC_PLUS",
          status: "PENDING",
          chargeAmount: 10,
          chargeCurrency: "USD",
          createdAt: new Date("2026-01-01"),
          pollAttempts: 0,
          lastPolledAt: null,
          orderStatus: "PLACED",
          orderTotalUsd: 10,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const res = await GET(makeRequest());
    const json = (await res.json()) as { rows: unknown[]; total: number };

    expect(res.status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.rows).toHaveLength(1);
  });

  it("forwards the page query param to listPaymentsForReview", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    await GET(makeRequest("http://localhost/api/admin/payments?page=3"));

    expect(listPaymentsForReview).toHaveBeenCalledWith({ page: 3 });
  });

  it("returns 500 (never leaks the raw error) when the data layer throws", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(listPaymentsForReview).mockRejectedValue(new Error("db exploded"));

    const res = await GET(makeRequest());
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("internal_error");
    expect(json.error.message).not.toContain("db exploded");
  });

  it("returns 429 when the per-admin rate limit is exceeded", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    // Drain the limit for this admin id, then confirm the next call is blocked.
    let lastStatus = 200;
    for (let i = 0; i < 200; i++) {
      const res = await GET(makeRequest());
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }

    expect(lastStatus).toBe(429);
  });
});
