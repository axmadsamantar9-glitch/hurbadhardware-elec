/**
 * Tests for GET /api/cron/fx-rates (U23). No live network call anywhere --
 * the FxRateProvider is injected via __setFxRateProviderForTest.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFxRateCreate, mockIsAuthorizedCronRequest } = vi.hoisted(() => ({
  mockFxRateCreate: vi.fn(),
  mockIsAuthorizedCronRequest: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { fxRate: { create: mockFxRateCreate } } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/payments/cron-auth", () => ({
  isAuthorizedCronRequest: mockIsAuthorizedCronRequest,
}));

import { GET, __setFxRateProviderForTest } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost/api/cron/fx-rates", {
    headers: { authorization: "Bearer test-secret" },
  });
}

describe("GET /api/cron/fx-rates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when cron auth fails", async () => {
    mockIsAuthorizedCronRequest.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockFxRateCreate).not.toHaveBeenCalled();
  });

  it("inserts a new FxRate row (never updates in place) on success -- mocked provider only", async () => {
    mockIsAuthorizedCronRequest.mockReturnValue(true);
    __setFxRateProviderForTest({
      fetchRate: vi.fn().mockResolvedValue({
        rate: { toString: () => "130" },
        source: "mock-provider",
        fetchedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    } as never);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockFxRateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        base: "USD",
        quote: "KES",
        source: "mock-provider",
      }),
    });
  });

  it("returns 500 (without throwing past the handler) when the provider errors", async () => {
    mockIsAuthorizedCronRequest.mockReturnValue(true);
    __setFxRateProviderForTest({
      fetchRate: vi.fn().mockRejectedValue(new Error("provider unreachable")),
    } as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
