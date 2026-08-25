import { describe, expect, it } from "vitest";
import enMessages from "@/messages/en.json";
import soMessages from "@/messages/so.json";

/**
 * Real translation-file structural tests (AC1/AC4). These import the actual
 * shipped en.json/so.json — not hardcoded copies — so a future edit that
 * breaks parity or removes a key fails CI here instead of silently shipping.
 */

type MessageTree = { [key: string]: string | MessageTree };

function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? flattenKeys(value, path) : [path];
  });
}

describe("translation namespaces (AC1)", () => {
  const requiredNamespaces = ["common", "nav", "product", "cart", "checkout", "account", "admin"];

  it.each(requiredNamespaces)("en.json has the %s namespace", (namespace) => {
    expect(enMessages).toHaveProperty(namespace);
  });

  it.each(requiredNamespaces)("so.json has the %s namespace", (namespace) => {
    expect(soMessages).toHaveProperty(namespace);
  });

  it("has exact 1:1 key parity between en.json and so.json", () => {
    const enKeys = flattenKeys(enMessages).sort();
    const soKeys = flattenKeys(soMessages).sort();

    expect(soKeys).toEqual(enKeys);
  });
});

describe("product.addToCart round trip (AC4)", () => {
  it("exists as a non-empty string in both locales and differs between them", () => {
    expect(enMessages.product).toHaveProperty("addToCart");
    expect(soMessages.product).toHaveProperty("addToCart");

    const en = enMessages.product.addToCart;
    const so = soMessages.product.addToCart;

    expect(typeof en).toBe("string");
    expect(typeof so).toBe("string");
    expect(en.length).toBeGreaterThan(0);
    expect(so.length).toBeGreaterThan(0);
    // Structural check only — not asserting exact Somali wording, just that
    // it's an actual translation rather than an accidental copy of English.
    expect(so).not.toBe(en);
  });
});
