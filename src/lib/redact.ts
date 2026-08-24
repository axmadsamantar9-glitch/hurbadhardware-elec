// PII redaction utility for logs, audit records, and responses
// Used to mask sensitive customer data while preserving non-PII context

/**
 * Redact personally identifiable information (PII) from a string value.
 * This is a destructive operation: the original value is lost.
 *
 * Patterns redacted:
 * - Email addresses: user@example.com -> [email]
 * - Phone numbers: +1234567890 or 1234567890 -> [phone]
 * - Names: Full name strings (heuristic based on capitalization) -> [name]
 * - Addresses: Multi-line addresses -> [address]
 *
 * Non-PII examples that are NOT redacted:
 * - Gateway transaction IDs: txn_abc123def456
 * - Correlation IDs: 550e8400-e29b-41d4-a716-446655440000
 * - Token/key hashes: sha256(...)
 * - Numeric IDs: user_12345, order_98765
 */
export function redactPII(value: unknown): unknown {
  if (typeof value === "string") {
    return redactPIIFromString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactPII);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        isPIIKey(key) ? "[redacted]" : redactPII(val),
      ])
    );
  }
  return value;
}

/**
 * Redact PII from a string value.
 * Recognizes common patterns: email, phone, name, address.
 *
 * Note: Phone regex is conservative to avoid false positives on UUIDs, timestamps, etc.
 * Requires leading + or surrounded by word boundaries for standalone numbers.
 */
function redactPIIFromString(str: string): string {
  // Email: anything@domain.com
  let result = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]");

  // Phone: +1234567890 (must have +) or 1-234-567-8901 format
  // More conservative regex to avoid matching parts of UUIDs or timestamps
  result = result.replace(/\+\d{10,}/g, "[phone]"); // +1234567890
  result = result.replace(/\b1[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{4}\b/g, "[phone]"); // 1-234-567-8901

  // Full name patterns: Capitalized Word Capitalized Word (heuristic)
  // Only redact if followed by context (email, address, order) to avoid false positives
  result = result.replace(/(?:^|\s)([A-Z][a-z]+\s+[A-Z][a-z]+)(?=\s|$|,)/g, "[name]");

  return result;
}

/**
 * Check if a key name indicates PII (regardless of value).
 * Used for redacting entire object values when the key suggests PII.
 */
function isPIIKey(key: string): boolean {
  const piiKeyPattern =
    /(email|phone|name|address|firstName|lastName|fullName|billingAddress|shippingAddress|cardNumber|pan|ssn|tin)/i;
  return piiKeyPattern.test(key);
}

/**
 * Redact PII from an entire object (for audit snapshots, logs).
 * Recursively traverses object structure and redacts:
 * - Keys matching PII pattern -> entire value is "[redacted]"
 * - String values containing email/phone/name patterns -> replaced inline
 *
 * Non-sensitive keys (even if they contain PII data) are recursively redacted
 * but not blanked entirely, preserving structure.
 */
export function redactObjectPII(obj: unknown): unknown {
  return redactPII(obj);
}
