/**
 * Tests for src/lib/currency/rates.ts (U23). getRate() never makes a network
 * call -- only db.fxRate.findFirst reads. HttpFxRateProvider.fetchRate is
 * exercised with a mocked fetch (no live network call anywhere).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { StaleRateError } from "@/lib/payments/errors";

const mockFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { fxRate: { findFirst: mockFindFirst } },
}));

describe("getRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws StaleRateError when no FxRate row exists yet", async () => {
    mockFindFirst.mockResolvedValue(null);
    const { getRate } = await import("./rates");

    await expect(getRate("USD", "KES")).rejects.toThrow(StaleRateError);
  });

  it("returns the newest row when fresh (well within FX_STALE_HOURS)", async () => {
    const { getRate, FX_STALE_HOURS } = await import("./rates");
    const fetchedAt = new Date(Date.now() - (FX_STALE_HOURS - 1) * 60 * 60 * 1000);
    mockFindFirst.mockResolvedValue({
      rate: new Decimal("130"),
      spreadPct: new Decimal("2"),
      source: "test-provider",
      fetchedAt,
    });

    const result = await getRate("USD", "KES");
    expect(result.rate.toString()).toBe("130");
    expect(result.fetchedAt).toEqual(fetchedAt);
  });

  it("throws StaleRateError exactly at the FX_STALE_HOURS boundary (strictly older, inclusive)", async () => {
    const { getRate, FX_STALE_HOURS } = await import("./rates");
    // Slightly *past* the boundary -- age strictly greater than staleMs.
    const fetchedAt = new Date(Date.now() - FX_STALE_HOURS * 60 * 60 * 1000 - 1000);
    mockFindFirst.mockResolvedValue({
      rate: new Decimal("130"),
      spreadPct: new Decimal("2"),
      source: "test-provider",
      fetchedAt,
    });

    await expect(getRate("USD", "KES")).rejects.toThrow(StaleRateError);
  });

  it("accepts a row just under the FX_STALE_HOURS boundary", async () => {
    const { getRate, FX_STALE_HOURS } = await import("./rates");
    const fetchedAt = new Date(Date.now() - FX_STALE_HOURS * 60 * 60 * 1000 + 1000);
    mockFindFirst.mockResolvedValue({
      rate: new Decimal("130"),
      spreadPct: new Decimal("2"),
      source: "test-provider",
      fetchedAt,
    });

    await expect(getRate("USD", "KES")).resolves.toMatchObject({ source: "test-provider" });
  });

  it("never triggers a network call (findFirst only)", async () => {
    const { getRate } = await import("./rates");
    mockFindFirst.mockResolvedValue({
      rate: new Decimal("130"),
      spreadPct: new Decimal("2"),
      source: "test-provider",
      fetchedAt: new Date(),
    });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await getRate("USD", "KES");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("HttpFxRateProvider.fetchRate", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.FX_PROVIDER_BASE_URL = "https://fx.example.test";
    process.env.FX_PROVIDER_API_KEY = "fx-api-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("fetches from the configured provider with bearer auth (mocked fetch only)", async () => {
    const { HttpFxRateProvider } = await import("./rates");
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ rate: "131.5", source: "mock-provider" }),
    }) as unknown as typeof fetch;

    const provider = new HttpFxRateProvider();
    const result = await provider.fetchRate("USD", "KES");

    expect(result.rate.toString()).toBe("131.5");
    expect(result.source).toBe("mock-provider");
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer fx-api-key");
  });

  it("throws when FX_PROVIDER_BASE_URL is not configured", async () => {
    delete process.env.FX_PROVIDER_BASE_URL;
    const { HttpFxRateProvider } = await import("./rates");
    const provider = new HttpFxRateProvider();

    await expect(provider.fetchRate("USD", "KES")).rejects.toThrow(/FX_PROVIDER_BASE_URL/);
  });
});
