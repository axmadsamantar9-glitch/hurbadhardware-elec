/**
 * Tests for src/lib/currency/format.ts (U23). Display-only formatting --
 * never used for money math, so these tests only assert on the rendered
 * string shape, not precision.
 */
import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats USD with 2 fraction digits and a $ symbol", () => {
    const result = formatCurrency(19.99, "USD");
    expect(result).toContain("19.99");
    expect(result).toMatch(/\$/);
  });

  it("formats KES with 0 fraction digits (whole-shilling display)", () => {
    const result = formatCurrency(1301, "KES");
    expect(result).not.toMatch(/\.\d/);
    expect(result).toContain("1,301");
  });

  it("accepts a Decimal instance, not just number/string", () => {
    const result = formatCurrency(new Decimal("9.99"), "USD");
    expect(result).toContain("9.99");
  });

  it("accepts a numeric string", () => {
    const result = formatCurrency("42.50", "USD");
    expect(result).toContain("42.50");
  });
});
