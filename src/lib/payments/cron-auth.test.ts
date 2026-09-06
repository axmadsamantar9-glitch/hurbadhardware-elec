/**
 * Tests for src/lib/payments/cron-auth.ts (U23). Fail-closed bearer-token
 * auth for the cron routes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost/api/cron/reconcile", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("isAuthorizedCronRequest", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects when CRON_SECRET itself is unset (fail-closed, no allow-all fallback)", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCronRequest(makeRequest("Bearer anything"))).toBe(false);
  });

  it("accepts a correctly-formed bearer token matching CRON_SECRET", () => {
    process.env.CRON_SECRET = "correct-secret";
    expect(isAuthorizedCronRequest(makeRequest("Bearer correct-secret"))).toBe(true);
  });

  it("rejects a wrong token", () => {
    process.env.CRON_SECRET = "correct-secret";
    expect(isAuthorizedCronRequest(makeRequest("Bearer wrong-secret"))).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    process.env.CRON_SECRET = "correct-secret";
    expect(isAuthorizedCronRequest(makeRequest())).toBe(false);
  });

  it("rejects a non-Bearer auth scheme", () => {
    process.env.CRON_SECRET = "correct-secret";
    expect(isAuthorizedCronRequest(makeRequest("Basic correct-secret"))).toBe(false);
  });

  it("rejects a mismatched-length token without throwing", () => {
    process.env.CRON_SECRET = "correct-secret";
    expect(() => isAuthorizedCronRequest(makeRequest("Bearer x"))).not.toThrow();
    expect(isAuthorizedCronRequest(makeRequest("Bearer x"))).toBe(false);
  });
});
