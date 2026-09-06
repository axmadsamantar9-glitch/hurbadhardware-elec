import { describe, it, expect } from "vitest";
import { getGatewayForMethod, getAllowedPaymentMethods } from "./methods";

describe("getGatewayForMethod", () => {
  it("maps every PaymentMethod to its single gateway", () => {
    expect(getGatewayForMethod("EVC_PLUS")).toBe("WAAFIPAY");
    expect(getGatewayForMethod("CARD")).toBe("WAAFIPAY");
    expect(getGatewayForMethod("EDAHAB")).toBe("EDAHAB");
    expect(getGatewayForMethod("MPESA")).toBe("PAYSTACK");
  });
});

describe("getAllowedPaymentMethods", () => {
  it("Somalia allows EVC_PLUS, EDAHAB, CARD", () => {
    expect(getAllowedPaymentMethods("SO")).toEqual(["EVC_PLUS", "EDAHAB", "CARD"]);
  });

  it("Kenya allows MPESA, CARD", () => {
    expect(getAllowedPaymentMethods("KE")).toEqual(["MPESA", "CARD"]);
  });

  it("Ethiopia allows CARD only", () => {
    expect(getAllowedPaymentMethods("ET")).toEqual(["CARD"]);
  });

  it("is case-insensitive", () => {
    expect(getAllowedPaymentMethods("ke")).toEqual(["MPESA", "CARD"]);
  });

  it("returns an empty array for an unlisted country -- never a silent default", () => {
    expect(getAllowedPaymentMethods("US")).toEqual([]);
  });
});
