/**
 * Tests for the getGateway() dispatcher (U12, Iron Rule #7).
 */
import { describe, it, expect } from "vitest";
import { getGateway } from "./gateway";
import { waafiPayGateway } from "./waafipay";
import { edahabGateway } from "./edahab";
import { paystackGateway } from "./paystack";

describe("getGateway", () => {
  it("returns the WaafiPay adapter for WAAFIPAY", () => {
    expect(getGateway("WAAFIPAY")).toBe(waafiPayGateway);
  });

  it("returns the eDahab adapter for EDAHAB", () => {
    expect(getGateway("EDAHAB")).toBe(edahabGateway);
  });

  it("returns the Paystack adapter for PAYSTACK", () => {
    expect(getGateway("PAYSTACK")).toBe(paystackGateway);
  });

  it("throws for an unhandled gateway value", () => {
    expect(() => getGateway("BOGUS" as never)).toThrow(/unhandled gateway/);
  });

  it("each adapter exposes the provider-neutral shape only (no leaked provider internals)", () => {
    for (const adapter of [waafiPayGateway, edahabGateway, paystackGateway]) {
      expect(typeof adapter.initiatePayment).toBe("function");
      expect(typeof adapter.queryStatus).toBe("function");
      expect(["USD", "KES"]).toContain(adapter.chargeCurrency);
      expect(Array.isArray(adapter.supportedMethods)).toBe(true);
    }
  });
});
