import { describe, it, expect } from "vitest";
import { readVariantAttributes, groupVariantOptions, findMatchingVariant } from "./variants";
import type { ProductVariant } from "@/types/database";

describe("readVariantAttributes", () => {
  it("returns string-valued entries from a plain object", () => {
    expect(readVariantAttributes({ storage: "128GB", color: "Black" })).toEqual({
      storage: "128GB",
      color: "Black",
    });
  });

  it("drops non-string values defensively", () => {
    expect(readVariantAttributes({ storage: "128GB", price: 10 as unknown as string })).toEqual({
      storage: "128GB",
    });
  });

  it("returns {} for null, arrays, or non-object input", () => {
    expect(readVariantAttributes(null)).toEqual({});
    expect(readVariantAttributes([1, 2] as unknown as ProductVariant["attributes"])).toEqual({});
  });
});

const baseVariant = { isActive: true };

describe("groupVariantOptions", () => {
  it("groups distinct values per attribute key across variants", () => {
    const variants = [
      { ...baseVariant, attributes: { storage: "128GB", color: "Black" } },
      { ...baseVariant, attributes: { storage: "256GB", color: "Black" } },
      { ...baseVariant, attributes: { storage: "128GB", color: "Blue" } },
    ];
    expect(groupVariantOptions(variants)).toEqual({
      storage: ["128GB", "256GB"],
      color: ["Black", "Blue"],
    });
  });

  it("skips inactive variants", () => {
    const variants = [
      { isActive: false, attributes: { storage: "512GB" } },
      { isActive: true, attributes: { storage: "128GB" } },
    ];
    expect(groupVariantOptions(variants)).toEqual({ storage: ["128GB"] });
  });

  it("returns {} for an empty variant list", () => {
    expect(groupVariantOptions([])).toEqual({});
  });
});

describe("findMatchingVariant", () => {
  const variants = [
    { isActive: true, attributes: { storage: "128GB", color: "Black" } },
    { isActive: true, attributes: { storage: "256GB", color: "Black" } },
    { isActive: false, attributes: { storage: "512GB", color: "Black" } },
  ];

  it("finds the variant matching every selected attribute", () => {
    expect(findMatchingVariant(variants, { storage: "256GB", color: "Black" })).toBe(variants[1]);
  });

  it("returns undefined when no active variant matches", () => {
    expect(findMatchingVariant(variants, { storage: "512GB", color: "Black" })).toBeUndefined();
  });

  it("returns undefined for a partially-invalid combination", () => {
    expect(findMatchingVariant(variants, { storage: "128GB", color: "Blue" })).toBeUndefined();
  });
});
