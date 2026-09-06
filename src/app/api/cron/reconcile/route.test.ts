/**
 * Tests for GET /api/cron/reconcile (U23, Iron Rule #2). The reconciliation
 * sweep itself is exercised in src/lib/payments/reconcile.test.ts -- here we
 * only prove the cron route's auth gate and pass-through of the summary.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsAuthorizedCronRequest, mockReconcilePendingPayments } = vi.hoisted(() => ({
  mockIsAuthorizedCronRequest: vi.fn(),
  mockReconcilePendingPayments: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/payments/cron-auth", () => ({
  isAuthorizedCronRequest: mockIsAuthorizedCronRequest,
}));
vi.mock("@/lib/payments/reconcile", () => ({
  reconcilePendingPayments: mockReconcilePendingPayments,
}));

import { GET } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost/api/cron/reconcile", {
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("GET /api/cron/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 and never runs the sweep when cron auth fails", async () => {
    mockIsAuthorizedCronRequest.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockReconcilePendingPayments).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its summary on success", async () => {
    mockIsAuthorizedCronRequest.mockReturnValue(true);
    mockReconcilePendingPayments.mockResolvedValue({
      scanned: 3,
      completed: 1,
      failed: 1,
      expired: 0,
      stillPending: 1,
      erroredPolls: 0,
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, scanned: 3, completed: 1, failed: 1 });
  });
});
