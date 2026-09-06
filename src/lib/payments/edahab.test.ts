/**
 * STRUCTURALLY VERIFIED -- LIVE PROVIDER VERIFICATION PENDING CREDENTIALS
 *
 * All HTTP calls in this file are mocked (global.fetch); no live network
 * call is ever made. eDahab has no documented sandbox at all (see file
 * header of edahab.ts and docs/agents/run-state.md).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { edahabGateway } from "./edahab";

const ENV = {
  EDAHAB_BASE_URL: "https://edahab.example.test",
  EDAHAB_API_KEY: "edahab-api-key",
  EDAHAB_API_SECRET: "edahab-api-secret",
  EDAHAB_AGENT_CODE: "agent-1",
};

function mockFetchOnce(jsonBody: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(jsonBody),
  }) as unknown as typeof fetch;
}

describe("edahab adapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("exact-string-reuse (hash computed over the EXACT request body string)", () => {
    it("hashes the same literal string sent as the HTTP body, not a re-serialized copy", async () => {
      mockFetchOnce({ StatusCode: 1, TransactionId: "t1" });

      await edahabGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10.005"),
        chargeAmount: new Decimal("10.005"),
        chargeCurrency: "USD",
        method: "EDAHAB",
        orderId: "order-1",
        customerPhone: "+252611111111",
        returnUrl: "https://hurbadhardware.example/return",
      });

      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const [url, init] = fetchMock.mock.calls[0];
      const sentBody = init.body as string;

      const parsedUrl = new URL(String(url));
      const hashFromUrl = parsedUrl.searchParams.get("hash")!;

      // Recompute the hash over the EXACT string that was sent as the body.
      const expectedHash = createHash("sha256")
        .update(sentBody + ENV.EDAHAB_API_SECRET)
        .digest("hex");
      expect(hashFromUrl).toBe(expectedHash);

      // Constructed proof that re-JSON.stringify-ing the "same" logical
      // object need not reproduce `sentBody` byte-for-byte: build an object
      // whose key insertion order differs from the adapter's own
      // construction order (the adapter builds ApiKey first, PhoneNumber
      // near the end) -- stringifying THIS object produces a different key
      // order/string than `sentBody`, proving the code must reuse one
      // captured string rather than re-derive it from a POJO.
      const reorderedEquivalent = JSON.stringify({
        PhoneNumber: "+252611111111",
        ReturnUrl: "https://hurbadhardware.example/return",
        ApiKey: ENV.EDAHAB_API_KEY,
        AgentCode: ENV.EDAHAB_AGENT_CODE,
        InvoiceId: "order-1",
        ReferenceId: "ref-1",
        Amount: "10.00",
        Currency: "USD",
      });
      expect(reorderedEquivalent).not.toBe(sentBody);
      const hashOfReordered = createHash("sha256")
        .update(reorderedEquivalent + ENV.EDAHAB_API_SECRET)
        .digest("hex");
      // Proves the two candidate strings hash differently -- so reusing the
      // exact captured string (not re-serializing) is load-bearing, not
      // cosmetic.
      expect(hashOfReordered).not.toBe(expectedHash);
    });

    it("truncates the amount with ROUND_DOWN before it is included in the signed body", async () => {
      mockFetchOnce({ StatusCode: 1, TransactionId: "t1" });

      await edahabGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10.999"),
        chargeAmount: new Decimal("10.999"),
        chargeCurrency: "USD",
        method: "EDAHAB",
        orderId: "order-1",
      });

      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(sentBody.Amount).toBe("10.99");
    });
  });

  describe("StatusCode mapping (mapStatusCode, exercised via queryStatus)", () => {
    it("maps StatusCode 1 -> PENDING", async () => {
      mockFetchOnce({ StatusCode: 1 });
      const result = await edahabGateway.queryStatus("ref-1");
      expect(result.status).toBe("PENDING");
    });

    it("maps StatusCode 2 -> COMPLETED (with transactionId present)", async () => {
      mockFetchOnce({ StatusCode: 2, TransactionId: "t1", Amount: "10.00" });
      const result = await edahabGateway.queryStatus("ref-1");
      expect(result.status).toBe("COMPLETED");
      if (result.status === "COMPLETED") {
        expect(result.gatewayTransactionId).toBe("t1");
        expect(result.settledAmount?.toString()).toBe("10");
      }
    });

    it("falls back to PENDING when StatusCode 2 has no TransactionId (never fabricates one)", async () => {
      mockFetchOnce({ StatusCode: 2 });
      const result = await edahabGateway.queryStatus("ref-1");
      expect(result.status).toBe("PENDING");
    });

    it("maps any other StatusCode (e.g. 5) -> FAILED", async () => {
      mockFetchOnce({ StatusCode: 5, StatusDescription: "declined" });
      const result = await edahabGateway.queryStatus("ref-1");
      expect(result).toMatchObject({ status: "FAILED", reason: "declined" });
    });

    it("maps a missing StatusCode -> FAILED (defensive default, never guessed into COMPLETED)", async () => {
      mockFetchOnce({});
      const result = await edahabGateway.queryStatus("ref-1");
      expect(result.status).toBe("FAILED");
    });
  });

  describe("initiatePayment", () => {
    it("never returns COMPLETED even when the invoice is issued successfully", async () => {
      mockFetchOnce({ StatusCode: 1, TransactionId: "t1" });
      const result = await edahabGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("10"),
        chargeCurrency: "USD",
        method: "EDAHAB",
        orderId: "order-1",
      });
      expect(result.status).toBe("PENDING");
    });

    it("returns FAILED when the invoice is rejected outright", async () => {
      mockFetchOnce({ StatusCode: 5, StatusDescription: "invalid_phone" });
      const result = await edahabGateway.initiatePayment({
        gatewayReference: "ref-1",
        amountUsd: new Decimal("10"),
        chargeAmount: new Decimal("10"),
        chargeCurrency: "USD",
        method: "EDAHAB",
        orderId: "order-1",
      });
      expect(result).toMatchObject({ ok: false, status: "FAILED", reason: "invalid_phone" });
    });
  });

  it("exposes no validateCallback -- eDahab has no server-to-server callback", () => {
    expect(edahabGateway.validateCallback).toBeUndefined();
  });
});
