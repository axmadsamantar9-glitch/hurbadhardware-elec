import { describe, it, expect } from "vitest";
import { redactPII, redactObjectPII } from "@/lib/redact";

describe("Privacy: PII Redaction", () => {
  describe("Email redaction", () => {
    it("should redact email addresses in strings", () => {
      const input = "User john@example.com tried to login";
      const output = redactPII(input);
      expect(output).not.toContain("john@example.com");
      expect(output).toContain("[email]");
    });

    it("should redact email object keys", () => {
      const input = { email: "user@example.com", id: "123" };
      const output = redactPII(input) as Record<string, unknown>;
      expect(output.email).toBe("[redacted]");
      expect(output.id).toBe("123");
    });
  });

  describe("Phone number redaction", () => {
    it("should redact phone numbers in strings", () => {
      const input = "Customer +1234567890 called support";
      const output = redactPII(input);
      expect(output).not.toContain("+1234567890");
      expect(output).toContain("[phone]");
    });

    it("should redact phone object keys", () => {
      const input = { phone: "+1234567890", orderId: "abc123" };
      const output = redactPII(input) as Record<string, unknown>;
      expect(output.phone).toBe("[redacted]");
      expect(output.orderId).toBe("abc123");
    });
  });

  describe("Non-PII preservation", () => {
    it("should preserve gateway transaction IDs", () => {
      const input = "Payment txn_abc123def456 completed";
      const output = redactPII(input);
      expect(output).toContain("txn_abc123def456");
    });

    it("should preserve numeric user IDs", () => {
      const input = { userId: "user_12345", orderId: "order_98765" };
      const output = redactPII(input) as Record<string, unknown>;
      expect(output.userId).toBe("user_12345");
      expect(output.orderId).toBe("order_98765");
    });

    it("should preserve status codes and amounts", () => {
      const input = {
        status: "COMPLETED",
        amount: 5000,
        currency: "KES",
      };
      const output = redactPII(input) as Record<string, unknown>;
      expect(output.status).toBe("COMPLETED");
      expect(output.amount).toBe(5000);
      expect(output.currency).toBe("KES");
    });
  });

  describe("Sensitive field types", () => {
    it("should redact cardNumber", () => {
      const input = { cardNumber: "4532123456789012" };
      const output = redactPII(input) as Record<string, unknown>;
      expect(output.cardNumber).toBe("[redacted]");
    });

    it("should redact PAN", () => {
      const input = { pan: "123456789012" };
      const output = redactPII(input) as Record<string, unknown>;
      expect(output.pan).toBe("[redacted]");
    });
  });

  describe("Soft-delete anonymization", () => {
    it("should prepare user data for anonymization", () => {
      const userData = {
        id: "user_123",
        email: "john@example.com",
        name: "John Doe",
        phone: "+1234567890",
        address: "123 Main St",
        createdAt: "2026-08-24T00:00:00Z",
      };

      const anonymized = redactPII(userData) as Record<string, unknown>;

      expect(anonymized.id).toBe("user_123");
      expect(anonymized.email).toBe("[redacted]");
      expect(anonymized.name).toBe("[redacted]");
      expect(anonymized.phone).toBe("[redacted]");
      expect(anonymized.address).toBe("[redacted]");
      // createdAt is not a PII key, so value should be preserved or not redacted
      expect(typeof anonymized.createdAt).toBe("string");
    });
  });

  describe("Payment audit logging", () => {
    it("should preserve gateway transaction ID in audit", () => {
      const paymentAudit = {
        action: "payment.complete",
        gatewayTxId: "txn_abc123def456",
        customerName: "John Doe",
        customerEmail: "john@example.com",
        amount: 5000,
      };

      const redacted = redactObjectPII(paymentAudit) as Record<string, unknown>;

      expect(redacted.gatewayTxId).toBe("txn_abc123def456");
      expect(redacted.customerName).toBe("[redacted]");
      expect(redacted.customerEmail).toBe("[redacted]");
      expect(redacted.amount).toBe(5000);
    });
  });

  describe("Recursive object redaction", () => {
    it("should redact nested objects", () => {
      const input = {
        user: {
          email: "john@example.com",
          name: "John Doe",
        },
        order: {
          id: "order_123",
          status: "COMPLETED",
        },
      };

      const output = redactPII(input) as Record<string, unknown>;

      expect((output.user as Record<string, unknown>).email).toBe("[redacted]");
      expect((output.user as Record<string, unknown>).name).toBe("[redacted]");
      expect((output.order as Record<string, unknown>).id).toBe("order_123");
    });

    it("should redact arrays of objects", () => {
      const input = {
        orders: [
          { customerId: "cust_1", customerEmail: "a@example.com" },
          { customerId: "cust_2", customerEmail: "b@example.com" },
        ],
      };

      const output = redactPII(input) as Record<string, unknown>;
      const orders = output.orders as Array<Record<string, unknown>>;

      expect(orders[0].customerEmail).toBe("[redacted]");
      expect(orders[1].customerEmail).toBe("[redacted]");
      expect(orders[0].customerId).toBe("cust_1");
    });
  });
});
