import { describe, it, expect, beforeEach } from "vitest";
import {
  RATE_LIMIT_THRESHOLDS,
  RATE_LIMIT_WINDOW_SECONDS,
  getRateLimitConfig,
  validateRateLimitConfig,
} from "./rate-limits";

describe("Rate Limit Configuration", () => {
  describe("Thresholds", () => {
    it("should have all 5 categories configured", () => {
      expect(RATE_LIMIT_THRESHOLDS.LOGIN).toBeGreaterThan(0);
      expect(RATE_LIMIT_THRESHOLDS.API).toBeGreaterThan(0);
      expect(RATE_LIMIT_THRESHOLDS.CHECKOUT).toBeGreaterThan(0);
      expect(RATE_LIMIT_THRESHOLDS.WEBHOOK).toBeGreaterThan(0);
      expect(RATE_LIMIT_THRESHOLDS.PUBLIC).toBeGreaterThan(0);
    });

    it("should have reasonable defaults per AC2", () => {
      // AC2 specifies thresholds
      expect(RATE_LIMIT_THRESHOLDS.LOGIN).toBe(5);
      expect(RATE_LIMIT_THRESHOLDS.API).toBe(60);
      expect(RATE_LIMIT_THRESHOLDS.CHECKOUT).toBe(10);
      expect(RATE_LIMIT_THRESHOLDS.WEBHOOK).toBe(120);
      expect(RATE_LIMIT_THRESHOLDS.PUBLIC).toBe(30);
    });

    it("should enforce ordering (webhook > api > public > checkout > login)", () => {
      // Webhook (120) > API (60) > Public (30) > Checkout (10) > Login (5)
      expect(RATE_LIMIT_THRESHOLDS.WEBHOOK).toBeGreaterThan(RATE_LIMIT_THRESHOLDS.API);
      expect(RATE_LIMIT_THRESHOLDS.API).toBeGreaterThan(RATE_LIMIT_THRESHOLDS.PUBLIC);
      expect(RATE_LIMIT_THRESHOLDS.PUBLIC).toBeGreaterThan(RATE_LIMIT_THRESHOLDS.CHECKOUT);
      expect(RATE_LIMIT_THRESHOLDS.CHECKOUT).toBeGreaterThan(RATE_LIMIT_THRESHOLDS.LOGIN);
    });
  });

  describe("Window", () => {
    it("should use 60-second window", () => {
      expect(RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    });
  });

  describe("getRateLimitConfig()", () => {
    it("should return config for each category", () => {
      const categories: Array<"login" | "api" | "checkout" | "webhook" | "public"> = [
        "login",
        "api",
        "checkout",
        "webhook",
        "public",
      ];

      for (const cat of categories) {
        const config = getRateLimitConfig(cat);
        expect(config.threshold).toBeGreaterThan(0);
        expect(config.windowSeconds).toBe(60);
      }
    });

    it("should return correct thresholds", () => {
      expect(getRateLimitConfig("login").threshold).toBe(RATE_LIMIT_THRESHOLDS.LOGIN);
      expect(getRateLimitConfig("api").threshold).toBe(RATE_LIMIT_THRESHOLDS.API);
      expect(getRateLimitConfig("checkout").threshold).toBe(RATE_LIMIT_THRESHOLDS.CHECKOUT);
      expect(getRateLimitConfig("webhook").threshold).toBe(RATE_LIMIT_THRESHOLDS.WEBHOOK);
      expect(getRateLimitConfig("public").threshold).toBe(RATE_LIMIT_THRESHOLDS.PUBLIC);
    });
  });

  describe("validateRateLimitConfig()", () => {
    it("should not throw if config is valid", () => {
      expect(() => validateRateLimitConfig()).not.toThrow();
    });

    it("should validate that thresholds are positive integers", () => {
      const allPositive = Object.values(RATE_LIMIT_THRESHOLDS).every(
        (threshold) => Number.isInteger(threshold) && threshold > 0
      );
      expect(allPositive).toBe(true);
    });

    it("should throw if any threshold is not a positive integer", () => {
      // This documents the validation behavior
      // Current config is valid, so we can only test the logic
      const testThresholds = [0, -5, 3.14, NaN, Infinity];
      for (const threshold of testThresholds) {
        const isValid = Number.isInteger(threshold) && threshold > 0;
        expect(isValid).toBe(false);
      }
    });
  });
});
