import { describe, it, expect } from "vitest";
import { redactPII, redactObjectPII } from "./redact";

describe("redact.ts - PII Redaction Utility", () => {
  describe("redactPII - String Processing", () => {
    it("should redact email patterns", () => {
      const result = redactPII("Contact user@example.com for support");
      expect(result).toContain("[email]");
      expect(result).not.toContain("user@example.com");
    });

    it("should handle multiple emails", () => {
      const input = "Email alice@test.com or bob@test.com";
      const result = redactPII(input);
      expect((result as string).match(/\[email\]/g)?.length).toBe(2);
    });

    it("should redact phone numbers", () => {
      const result = redactPII("Call +1234567890");
      expect(result).toContain("[phone]");
      expect(result).not.toContain("+1234567890");
    });

    it("should redact names (capitalized patterns)", () => {
      const result = redactPII("Customer John Doe submitted order");
      expect(result).toContain("[name]");
    });

    it("should not redact lowercase text", () => {
      const input = "some text without proper names";
      const result = redactPII(input);
      expect(result).toBe(input);
    });
  });

  describe("redactPII - Object Processing", () => {
    it("should redact PII keys in objects", () => {
      const input = { email: "test@example.com", name: "Test User" };
      const result = redactPII(input) as Record<string, unknown>;
      expect(result.email).toBe("[redacted]");
      expect(result.name).toBe("[redacted]");
    });

    it("should preserve non-PII keys", () => {
      const input = { userId: "123", status: "active" };
      const result = redactPII(input) as Record<string, unknown>;
      expect(result.userId).toBe("123");
      expect(result.status).toBe("active");
    });

    it("should handle mixed objects", () => {
      const input = {
        id: "user_1",
        email: "user@example.com",
        phone: "+1234567890",
        role: "ADMIN",
      };
      const result = redactPII(input) as Record<string, unknown>;
      expect(result.id).toBe("user_1");
      expect(result.role).toBe("ADMIN");
      expect(result.email).toBe("[redacted]");
      expect(result.phone).toBe("[redacted]");
    });

    it("should handle nested objects", () => {
      const input = {
        user: { name: "Jane Doe", email: "jane@test.com" },
        orderId: "ord_123",
      };
      const result = redactPII(input) as Record<string, unknown>;
      const user = result.user as Record<string, unknown>;
      expect(user.name).toBe("[redacted]");
      expect(user.email).toBe("[redacted]");
      expect(result.orderId).toBe("ord_123");
    });

    it("should handle arrays", () => {
      const input = [
        { email: "a@test.com", id: "1" },
        { email: "b@test.com", id: "2" },
      ];
      const result = redactPII(input) as Array<Record<string, unknown>>;
      expect(result[0].email).toBe("[redacted]");
      expect(result[1].email).toBe("[redacted]");
      expect(result[0].id).toBe("1");
    });
  });

  describe("redactPII - Non-Sensitive Data Preservation", () => {
    it("should preserve transaction IDs", () => {
      const input = "Transaction txn_abc123def456 completed";
      const result = redactPII(input);
      expect(result).toContain("txn_abc123def456");
    });

    it("should not redact UUIDs that don't match phone pattern", () => {
      const input = "Order 550e8400-e29b-41d4-a716-446655440000 confirmed";
      const result = redactPII(input);
      // UUID with dashes and letters should not match conservative phone regex
      expect((result as string).includes("550e8400")).toBe(true);
    });

    it("should preserve numeric amounts", () => {
      const input = { amount: 5000, currency: "KES" };
      const result = redactPII(input) as Record<string, unknown>;
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe("KES");
    });
  });

  describe("redactObjectPII - Wrapper Function", () => {
    it("should call redactPII internally", () => {
      const input = { email: "test@example.com" };
      const result = redactObjectPII(input);
      expect((result as Record<string, unknown>).email).toBe("[redacted]");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null and undefined", () => {
      expect(redactPII(null)).toBe(null);
      expect(redactPII(undefined)).toBe(undefined);
    });

    it("should handle empty strings", () => {
      expect(redactPII("")).toBe("");
    });

    it("should handle empty objects", () => {
      const result = redactPII({});
      expect(result).toEqual({});
    });

    it("should handle boolean values", () => {
      expect(redactPII(true)).toBe(true);
      expect(redactPII(false)).toBe(false);
    });

    it("should handle numeric values", () => {
      expect(redactPII(42)).toBe(42);
      expect(redactPII(3.14)).toBe(3.14);
    });
  });
});
