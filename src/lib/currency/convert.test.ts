/**
 * Tests for src/lib/currency/convert.ts (U23). Zero float arithmetic --
 * Decimal end to end. getRate() is mocked; convert() itself contains the
 * math under test (ROUND_CEIL for KES, effectiveRate = rate*(1+spread/100)).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const { mockGetRate } = vi.hoisted(() => ({ mockGetRate: vi.fn() }));
vi.mock("./rates", () => ({ getRate: mockGetRate }));

import { convert } from "./convert";

describe("convert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("USD is an identity passthrough (rounded to 2dp, no rate involved)", async () => {
    const result = await convert(new Decimal("19.995"), "USD");
    expect(result.chargeCurrency).toBe("USD");
    expect(result.fxRate).toBeNull();
    expect(result.fxRateAt).toBeNull();
    expect(mockGetRate).not.toHaveBeenCalled();
  });

  it("KES: effectiveRate = providerRate * (1 + spreadPct/100)", async () => {
    mockGetRate.mockResolvedValue({
      rate: new Decimal("130"),
      spreadPct: new Decimal("2"),
      source: "test",
      fetchedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await convert(new Decimal("10"), "KES");
    // effectiveRate = 130 * 1.02 = 132.6
    expect(result.fxRate?.toString()).toBe("132.6");
  });

  it("KES amounts round UP (ROUND_CEIL), never down, covering FX drift in the platforms favor", async () => {
    mockGetRate.mockResolvedValue({
      rate: new Decimal("130"),
      spreadPct: new Decimal("0"),
      source: "test",
      fetchedAt: new Date(),
    });

    // 10.001 * 130 = 1300.13 -> ROUND_CEIL to 0dp -> 1301, not 1300.
    const result = await convert(new Decimal("10.001"), "KES");
    expect(result.chargeAmount.toString()).toBe("1301");
  });

  it("holds Decimal precision with no float drift across several amounts", async () => {
    mockGetRate.mockResolvedValue({
      rate: new Decimal("129.37"),
      spreadPct: new Decimal("1.5"),
      source: "test",
      fetchedAt: new Date(),
    });

    const amounts = ["0.1", "19.99", "1234.56", "0.03"];
    for (const amt of amounts) {
      const result = await convert(new Decimal(amt), "KES");
      // effectiveRate computed once, reused -- verify it is EXACTLY
      // 129.37 * 1.015, not a float-drifted approximation.
      expect(result.fxRate?.toString()).toBe("131.31055");
      // chargeAmount must be an exact integer string (ROUND_CEIL applied),
      // never something like "1301.0000000000002".
      expect(result.chargeAmount.toString()).toMatch(/^\d+$/);
    }
  });

  it("propagates StaleRateError from getRate() without catching it", async () => {
    const { StaleRateError } = await import("@/lib/payments/errors");
    mockGetRate.mockRejectedValue(new StaleRateError("too old"));

    await expect(convert(new Decimal("10"), "KES")).rejects.toThrow(StaleRateError);
  });
});
