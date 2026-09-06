/**
 * STRUCTURALLY VERIFIED -- LIVE PROVIDER VERIFICATION PENDING CREDENTIALS
 *
 * All HTTP calls in this file are mocked (global.fetch); no live network
 * call is ever made. WaafiPay sandbox credentials are blank in this
 * environment (see file header of waafipay.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { waafiPayGateway } from "./waafipay";

const ENV = {
  WAAFIPAY_BASE_URL: "https://waafipay.example.test",
  WAAFIPAY_MERCHANT_UID: "merchant-uid",
  WAAFIPAY_API_USER_ID: "api-user",
  WAAFIPAY_API_KEY: "super-secret-api-key",
  WAAFIPAY_WEBHOOK_SECRET: "webhook-secret",
};

function mockFetchOnce(jsonBody: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(jsonBody),
  }) as unknown as typeof fetch;
}

describe("waafipay adapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("initiatePayment", () => {
    it("truncates the charge amount with ROUND_DOWN, never round-half-up", async () => {
      mockFetchOnce({
        responseCode: "2001",
        responseMsg: "accepted",
        params: { transactionId: "txn-1" },
      });

      await waafiPayGateway.initiatePayment({
        gatewayReference: "order-1",
        amountUsd: new Decimal("10.995"),
        chargeAmount: new Decimal("10.995"),
        chargeCurrency: "USD",
        method: "EVC_PLUS",
        orderId: "order-1",
        customerPhone: "+252611111111",
      });

      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.serviceParams.transactionInfo.amount).toBe("10.99");
    });

    it("never returns COMPLETED, even on responseCode 2001", async () => {
      mockFetchOnce({
        responseCode: "2001",
        responseMsg: "accepted",
        params: { transactionId: "txn-1" },
      });

      const result = await waafiPayGateway.initiatePayment({
        gatewayReference: "order-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("10"),
        chargeCurrency: "USD",
        method: "EVC_PLUS",
        orderId: "order-1",
      });

      expect(result.status).toBe("PENDING");
      expect(result.status).not.toBe("COMPLETED");
    });

    it("returns FAILED for a non-2001 responseCode, without polling further", async () => {
      mockFetchOnce({ responseCode: "5001", responseMsg: "insufficient_funds" });

      const result = await waafiPayGateway.initiatePayment({
        gatewayReference: "order-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("10"),
        chargeCurrency: "USD",
        method: "EVC_PLUS",
        orderId: "order-1",
      });

      expect(result).toMatchObject({ ok: false, status: "FAILED", reason: "insufficient_funds" });
    });

    it("embeds credentials in the request body, not headers (Iron Rule #7)", async () => {
      mockFetchOnce({ responseCode: "2001", params: { transactionId: "t1" } });

      await waafiPayGateway.initiatePayment({
        gatewayReference: "order-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("10"),
        chargeCurrency: "USD",
        method: "EVC_PLUS",
        orderId: "order-1",
      });

      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const [url, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(String(url)).not.toContain(ENV.WAAFIPAY_API_KEY);
      expect(JSON.stringify(init.headers)).not.toContain(ENV.WAAFIPAY_API_KEY);
      expect(body.serviceParams.apiKey).toBe(ENV.WAAFIPAY_API_KEY);
    });
  });

  describe("queryStatus -- responseCode 2001 + params.state mapping", () => {
    const cases: Array<[string, "COMPLETED" | "FAILED" | "PENDING"]> = [
      ["APPROVED", "COMPLETED"],
      ["SUCCESS", "COMPLETED"],
      ["SETTLED", "COMPLETED"],
      ["approved", "COMPLETED"],
      ["DECLINED", "FAILED"],
      ["FAILED", "FAILED"],
      ["REJECTED", "FAILED"],
      ["PENDING", "PENDING"],
      ["SOME_UNKNOWN_STATE", "PENDING"],
      [undefined as unknown as string, "PENDING"],
    ];

    for (const [state, expected] of cases) {
      it("maps responseCode 2001 + params.state=" + String(state) + " -> " + expected, async () => {
        mockFetchOnce({
          responseCode: "2001",
          params: { transactionId: "txn-1", state, amount: "10.00" },
        });

        const result = await waafiPayGateway.queryStatus("order-1");
        expect(result.status).toBe(expected);
      });
    }

    it("treats responseCode 2001 alone (without reading state) as never sufficient for COMPLETED", async () => {
      mockFetchOnce({ responseCode: "2001", params: { transactionId: "txn-1" } });

      const result = await waafiPayGateway.queryStatus("order-1");
      expect(result.status).toBe("PENDING");
    });

    it("returns FAILED for a non-2001 responseCode on query", async () => {
      mockFetchOnce({ responseCode: "4001", responseMsg: "not_found" });

      const result = await waafiPayGateway.queryStatus("order-1");
      expect(result).toMatchObject({ status: "FAILED", reason: "not_found" });
    });

    it("falls back to PENDING (never fabricates COMPLETED) when state=APPROVED but no transactionId", async () => {
      mockFetchOnce({ responseCode: "2001", params: { state: "APPROVED" } });

      const result = await waafiPayGateway.queryStatus("order-1");
      expect(result.status).toBe("PENDING");
    });

    it("carries settledAmount only inside the terminal result, never overwriting the callers chargeAmount", async () => {
      mockFetchOnce({
        responseCode: "2001",
        params: { transactionId: "txn-1", state: "APPROVED", amount: "9.50" },
      });

      const result = await waafiPayGateway.queryStatus("order-1");
      expect(result.status).toBe("COMPLETED");
      if (result.status === "COMPLETED") {
        expect(result.settledAmount?.toString()).toBe("9.5");
        expect(Object.keys(result)).not.toContain("chargeAmount");
      }
    });
  });

  describe("validateCallback -- HMAC-SHA256", () => {
    function sign(secret: string, timestamp: string, eventId: string, rawBody: string) {
      return createHmac("sha256", secret)
        .update(timestamp + "." + eventId + "." + rawBody)
        .digest("hex");
    }

    it("accepts a validly-signed callback", () => {
      const rawBody = JSON.stringify({ params: { referenceId: "order-1", state: "APPROVED" } });
      const timestamp = "1700000000";
      const eventId = "evt-1";
      const signature = sign(ENV.WAAFIPAY_WEBHOOK_SECRET, timestamp, eventId, rawBody);

      const headers = new Headers({
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp,
        "x-webhook-event-id": eventId,
      });

      expect(waafiPayGateway.validateCallback!(rawBody, headers)).toBe(true);
    });

    it("rejects a tampered body against the original signature", () => {
      const rawBody = JSON.stringify({ params: { referenceId: "order-1", state: "APPROVED" } });
      const tamperedBody = JSON.stringify({
        params: { referenceId: "order-1", state: "DECLINED" },
      });
      const timestamp = "1700000000";
      const eventId = "evt-1";
      const signature = sign(ENV.WAAFIPAY_WEBHOOK_SECRET, timestamp, eventId, rawBody);

      const headers = new Headers({
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp,
        "x-webhook-event-id": eventId,
      });

      expect(waafiPayGateway.validateCallback!(tamperedBody, headers)).toBe(false);
    });

    it("rejects a tampered signature (wrong secret)", () => {
      const rawBody = JSON.stringify({ params: { referenceId: "order-1" } });
      const timestamp = "1700000000";
      const eventId = "evt-1";
      const signature = sign("wrong-secret", timestamp, eventId, rawBody);

      const headers = new Headers({
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp,
        "x-webhook-event-id": eventId,
      });

      expect(waafiPayGateway.validateCallback!(rawBody, headers)).toBe(false);
    });

    it("rejects when required headers are missing", () => {
      const rawBody = JSON.stringify({});
      expect(waafiPayGateway.validateCallback!(rawBody, new Headers())).toBe(false);
    });

    it("rejects when the secret itself is unconfigured (fail-closed)", () => {
      delete process.env.WAAFIPAY_WEBHOOK_SECRET;
      const rawBody = JSON.stringify({});
      const headers = new Headers({
        "x-webhook-signature": "deadbeef",
        "x-webhook-timestamp": "1700000000",
        "x-webhook-event-id": "evt-1",
      });
      expect(waafiPayGateway.validateCallback!(rawBody, headers)).toBe(false);
    });

    it("rejects a mismatched-length signature without throwing", () => {
      const rawBody = JSON.stringify({});
      const headers = new Headers({
        "x-webhook-signature": "ab",
        "x-webhook-timestamp": "1700000000",
        "x-webhook-event-id": "evt-1",
      });
      expect(() => waafiPayGateway.validateCallback!(rawBody, headers)).not.toThrow();
      expect(waafiPayGateway.validateCallback!(rawBody, headers)).toBe(false);
    });
  });
});
