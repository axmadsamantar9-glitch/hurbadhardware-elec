/**
 * STRUCTURALLY VERIFIED -- LIVE PROVIDER VERIFICATION PENDING CREDENTIALS
 *
 * All HTTP calls in this file are mocked (global.fetch); no live network
 * call is ever made. PAYSTACK_SECRET_KEY/PAYSTACK_PUBLIC_KEY are blank in
 * this environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { paystackGateway } from "./paystack";
import { InvalidAmountError } from "./errors";

const ENV = {
  PAYSTACK_SECRET_KEY: "sk_test_secret",
  PAYSTACK_BASE_URL: "https://paystack.example.test",
};

function mockFetchOnce(jsonBody: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(jsonBody),
  }) as unknown as typeof fetch;
}

describe("paystack adapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("integer KES amount enforcement", () => {
    it("rejects a non-integer KES amount with InvalidAmountError BEFORE any HTTP call", async () => {
      await expect(
        paystackGateway.initiatePayment({
          gatewayReference: "ref-1",
          amountUsd: new Decimal("10"),
          chargeAmount: new Decimal("1300.50"),
          chargeCurrency: "KES",
          method: "MPESA",
          orderId: "order-1",
          customerEmail: "cust@example.com",
        })
      ).rejects.toThrow(InvalidAmountError);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("accepts a whole-integer KES amount and does call the HTTP API", async () => {
      mockFetchOnce({
        status: true,
        data: { authorization_url: "https://pay", reference: "ref-1" },
      });

      const result = await paystackGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("1300"),
        chargeCurrency: "KES",
        method: "MPESA",
        orderId: "order-1",
        customerEmail: "cust@example.com",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("PENDING");
    });
  });

  describe("initiatePayment", () => {
    it("never returns COMPLETED on a successful initialize", async () => {
      mockFetchOnce({
        status: true,
        data: { reference: "ref-1", authorization_url: "https://pay" },
      });
      const result = await paystackGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("1300"),
        chargeCurrency: "KES",
        method: "MPESA",
        orderId: "order-1",
      });
      expect(result.status).toBe("PENDING");
    });

    it("returns FAILED when Paystack rejects the request", async () => {
      mockFetchOnce({ status: false, message: "invalid_email" });
      const result = await paystackGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("1300"),
        chargeCurrency: "KES",
        method: "MPESA",
        orderId: "order-1",
      });
      expect(result).toMatchObject({ ok: false, status: "FAILED", reason: "invalid_email" });
    });

    it("uses bearer auth, never embedding the secret key in the request body", async () => {
      mockFetchOnce({ status: true, data: { reference: "ref-1" } });
      await paystackGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("1300"),
        chargeCurrency: "KES",
        method: "MPESA",
        orderId: "order-1",
      });
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe("Bearer " + ENV.PAYSTACK_SECRET_KEY);
      expect(init.body as string).not.toContain(ENV.PAYSTACK_SECRET_KEY);
    });
  });

  describe("queryStatus", () => {
    it("maps status=success -> COMPLETED", async () => {
      mockFetchOnce({ status: true, data: { status: "success", id: 12345, reference: "ref-1" } });
      const result = await paystackGateway.queryStatus("ref-1");
      expect(result.status).toBe("COMPLETED");
      if (result.status === "COMPLETED") {
        expect(result.gatewayTransactionId).toBe("12345");
      }
    });

    it("maps status=failed/abandoned/reversed -> FAILED", async () => {
      for (const txStatus of ["failed", "abandoned", "reversed"]) {
        mockFetchOnce({ status: true, data: { status: txStatus } });
        const result = await paystackGateway.queryStatus("ref-1");
        expect(result).toMatchObject({ status: "FAILED", reason: txStatus });
      }
    });

    it("maps status=pending -> PENDING", async () => {
      mockFetchOnce({ status: true, data: { status: "pending" } });
      const result = await paystackGateway.queryStatus("ref-1");
      expect(result.status).toBe("PENDING");
    });

    it("falls back to PENDING when success has no data.id (never fabricates a transaction id)", async () => {
      mockFetchOnce({ status: true, data: { status: "success" } });
      const result = await paystackGateway.queryStatus("ref-1");
      expect(result.status).toBe("PENDING");
    });

    it("returns FAILED when the verify call itself reports status:false", async () => {
      mockFetchOnce({ status: false, message: "transaction_not_found" });
      const result = await paystackGateway.queryStatus("ref-1");
      expect(result).toMatchObject({ status: "FAILED", reason: "transaction_not_found" });
    });
  });

  describe("validateCallback -- HMAC-SHA512 over x-paystack-signature", () => {
    it("accepts a validly-signed callback", () => {
      const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-1" } });
      const signature = createHmac("sha512", ENV.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
      const headers = new Headers({ "x-paystack-signature": signature });
      expect(paystackGateway.validateCallback!(rawBody, headers)).toBe(true);
    });

    it("rejects a tampered body", () => {
      const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-1" } });
      const tampered = JSON.stringify({ event: "charge.success", data: { reference: "ref-2" } });
      const signature = createHmac("sha512", ENV.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
      const headers = new Headers({ "x-paystack-signature": signature });
      expect(paystackGateway.validateCallback!(tampered, headers)).toBe(false);
    });

    it("rejects a signature computed with the wrong secret", () => {
      const rawBody = JSON.stringify({ event: "charge.success" });
      const signature = createHmac("sha512", "wrong-secret").update(rawBody).digest("hex");
      const headers = new Headers({ "x-paystack-signature": signature });
      expect(paystackGateway.validateCallback!(rawBody, headers)).toBe(false);
    });

    it("rejects when the signature header is missing", () => {
      const rawBody = JSON.stringify({});
      expect(paystackGateway.validateCallback!(rawBody, new Headers())).toBe(false);
    });

    it("rejects (without throwing) when the secret key is unconfigured", () => {
      delete process.env.PAYSTACK_SECRET_KEY;
      const rawBody = JSON.stringify({});
      const headers = new Headers({ "x-paystack-signature": "deadbeef" });
      expect(() => paystackGateway.validateCallback!(rawBody, headers)).not.toThrow();
      expect(paystackGateway.validateCallback!(rawBody, headers)).toBe(false);
    });
  });
});
