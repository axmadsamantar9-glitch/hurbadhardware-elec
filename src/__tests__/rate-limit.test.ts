import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimiter,
  createRateLimitResponse,
  getClientIP,
  logRateLimitTrigger,
} from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";

describe("Rate Limiting Middleware", () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  describe("Limit enforcement (token bucket)", () => {
    it("should allow N requests up to threshold", () => {
      const threshold = 5;
      const key = "auth:192.168.1.1:test@example.com";

      for (let i = 0; i < threshold; i++) {
        const result = rateLimiter.check(key, threshold);
        expect(result.allowed).toBe(true);
        expect(result.retryAfter).toBeUndefined();
      }
    });

    it("should deny request N+1", () => {
      const threshold = 5;
      const key = "auth:192.168.1.1:test@example.com";

      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key, threshold);
      }

      const result = rateLimiter.check(key, threshold);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should calculate Retry-After correctly", () => {
      const threshold = 5;
      const key = "auth:192.168.1.1:test@example.com";

      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key, threshold);
      }

      const result = rateLimiter.check(key, threshold);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(12);
    });
  });

  describe("Key-based bucketing (isolation)", () => {
    it("should isolate rate limits by IP", () => {
      const threshold = 2;

      const key1 = "public:192.168.1.1";
      rateLimiter.check(key1, threshold);
      rateLimiter.check(key1, threshold);
      const result1 = rateLimiter.check(key1, threshold);
      expect(result1.allowed).toBe(false);

      const key2 = "public:192.168.1.2";
      const result2 = rateLimiter.check(key2, threshold);
      expect(result2.allowed).toBe(true);
    });

    it("should isolate rate limits by user ID", () => {
      const threshold = 3;

      const key1 = "api:user_12345";
      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key1, threshold);
      }

      const key2 = "api:user_67890";
      const result = rateLimiter.check(key2, threshold);
      expect(result.allowed).toBe(true);

      const result1 = rateLimiter.check(key1, threshold);
      expect(result1.allowed).toBe(false);
    });

    it("should isolate by composite key (IP + account)", () => {
      const threshold = 2;

      const key1 = "auth:192.168.1.1:user@example.com";
      const key2 = "auth:192.168.1.2:user@example.com";

      rateLimiter.check(key1, threshold);
      rateLimiter.check(key1, threshold);
      rateLimiter.check(key2, threshold);
      rateLimiter.check(key2, threshold);

      expect(rateLimiter.check(key1, threshold).allowed).toBe(false);
      expect(rateLimiter.check(key2, threshold).allowed).toBe(false);
    });
  });

  describe("HTTP 429 response creation", () => {
    it("should create valid 429 response", () => {
      const retryAfter = 30;
      const response = createRateLimitResponse(retryAfter);

      expect(response.status).toBe(429);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("Retry-After")).toBe("30");
    });

    it("should include error object in response body", async () => {
      const response = createRateLimitResponse(60);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body.error).toBeDefined();
      expect((body.error as Record<string, unknown>).message).toBe("Rate limit exceeded");
      expect((body.error as Record<string, unknown>).code).toBe("rate_limit_exceeded");
      expect((body.error as Record<string, unknown>).retryAfter).toBe(60);
    });
  });

  describe("Configuration and thresholds", () => {
    it("should use configured thresholds from environment", () => {
      const loginConfig = getRateLimitConfig("login");
      expect(loginConfig.threshold).toBeGreaterThan(0);
      expect(loginConfig.windowSeconds).toBe(60);
    });

    it("should respect all 5 endpoint categories", () => {
      const categories: Array<"login" | "api" | "checkout" | "webhook" | "public"> = [
        "login",
        "api",
        "checkout",
        "webhook",
        "public",
      ];

      for (const category of categories) {
        const config = getRateLimitConfig(category);
        expect(config.threshold).toBeGreaterThan(0);
        expect(config.windowSeconds).toBe(60);
      }
    });
  });

  describe("Utility functions", () => {
    it("getClientIP should extract IP from x-forwarded-for", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "192.168.1.100, 10.0.0.1",
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe("192.168.1.100");
    });

    it("getClientIP should fall back to x-real-ip", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "192.168.1.50",
        },
      });

      const ip = getClientIP(request);
      expect(ip).toBe("192.168.1.50");
    });

    it("getClientIP should return unknown if no IP headers", () => {
      const request = new Request("http://localhost");
      const ip = getClientIP(request);
      expect(ip).toBe("unknown");
    });

    it("logRateLimitTrigger should log event with context", () => {
      // This test documents that logging should be called when rate limit triggers
      // Actual logger testing is in logger.test.ts
      const key = "auth:192.168.1.1:test@example.com";
      const category = "login";
      const threshold = 5;

      expect(() => {
        logRateLimitTrigger(key, category, threshold, "test-correlation-id");
      }).not.toThrow();
    });
  });

  describe("Login rate-limiting (as wired into src/auth.ts authorize())", () => {
    // src/auth.ts's Credentials authorize() computes the rate-limit key as
    // `login:${clientIP}:${email}` and checks it against
    // getRateLimitConfig("login") threshold *before* validating credentials.
    // The `login:` prefix is load-bearing: without it, an attacker-supplied
    // IP/email combination can collide with another category's key (e.g.
    // catalog routes' `public:${clientIP}`) in the shared rateLimiter
    // singleton, enabling a targeted cross-category DoS. These tests exercise
    // that exact key shape/threshold against the shared rateLimiter singleton
    // to guard against regressions, since auth.ts itself can't be imported in
    // the Node test environment (see docs/agents/learnings/qa-test.md).
    it("allows up to the configured login threshold (5) attempts per IP+account", () => {
      const { threshold } = getRateLimitConfig("login");
      expect(threshold).toBe(5);

      const ip = "203.0.113.9";
      const email = "victim@example.com";
      const key = `login:${ip}:${email}`;

      for (let i = 0; i < threshold; i++) {
        expect(rateLimiter.check(key, threshold).allowed).toBe(true);
      }
    });

    it("rejects the 6th attempt within the window regardless of whether credentials would be valid", () => {
      const { threshold } = getRateLimitConfig("login");
      const ip = "203.0.113.9";
      const email = "victim@example.com";
      const key = `login:${ip}:${email}`;

      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key, threshold);
      }

      // The 6th attempt is denied by the bucket itself -- auth.ts throws
      // "Invalid email or password" here without ever touching the DB or
      // bcrypt, so this is enforced independent of the submitted password.
      const sixthAttempt = rateLimiter.check(key, threshold);
      expect(sixthAttempt.allowed).toBe(false);
      expect(sixthAttempt.retryAfter).toBeGreaterThan(0);
    });

    it("does not rate-limit a different account from the same IP (keyed by IP+account, not IP alone)", () => {
      const { threshold } = getRateLimitConfig("login");
      const ip = "203.0.113.9";

      const key1 = `login:${ip}:attacker-target-1@example.com`;
      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key1, threshold);
      }
      expect(rateLimiter.check(key1, threshold).allowed).toBe(false);

      const key2 = `login:${ip}:attacker-target-2@example.com`;
      expect(rateLimiter.check(key2, threshold).allowed).toBe(true);
    });

    it("does not rate-limit the same account from a different IP (keyed by IP+account, not account alone)", () => {
      const { threshold } = getRateLimitConfig("login");
      const email = "shared-account@example.com";

      const key1 = `login:203.0.113.9:${email}`;
      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key1, threshold);
      }
      expect(rateLimiter.check(key1, threshold).allowed).toBe(false);

      const key2 = `login:198.51.100.20:${email}`;
      expect(rateLimiter.check(key2, threshold).allowed).toBe(true);
    });
  });

  describe("Token refill edge cases", () => {
    it("should handle rapid-fire requests", () => {
      const threshold = 5;
      const key = "test-key";

      // Rapid requests should only consume tokens
      const results: boolean[] = [];
      for (let i = 0; i < threshold + 5; i++) {
        const result = rateLimiter.check(key, threshold);
        results.push(result.allowed);
      }

      // First 5 allowed, rest denied
      expect(results.filter((r) => r).length).toBe(threshold);
      expect(results.filter((r) => !r).length).toBe(5);
    });

    it("should cap tokens at threshold", () => {
      const threshold = 5;
      const key = "test-key";

      // Make a request to initialize bucket
      rateLimiter.check(key, threshold);

      // Get current state
      let state = rateLimiter.getState(key);
      expect(state?.tokens).toBeLessThanOrEqual(threshold);

      // Tokens should never exceed threshold
      const initialTokens = state?.tokens || 0;
      for (let i = 0; i < 10; i++) {
        rateLimiter.check(key, threshold);
        state = rateLimiter.getState(key);
        expect(state?.tokens).toBeLessThanOrEqual(threshold);
      }
    });

    it("should return minimum retryAfter of 1", () => {
      const threshold = 3;
      const key = "test-key";

      // Exhaust tokens
      for (let i = 0; i < threshold; i++) {
        rateLimiter.check(key, threshold);
      }

      // Request immediately denied
      const result = rateLimiter.check(key, threshold);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    });
  });
});
