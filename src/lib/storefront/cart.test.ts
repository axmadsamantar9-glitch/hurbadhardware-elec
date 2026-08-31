import { describe, it, expect } from "vitest";
import {
  isValidQuantity,
  cartLineKey,
  mergeCartLines,
  roundMoney,
  totalCartQuantity,
} from "./cart";

describe("isValidQuantity", () => {
  it.each([1, 2, 99, 1000])("accepts positive integer %i", (v) => {
    expect(isValidQuantity(v)).toBe(true);
  });

  it.each([0, -1, -99])("rejects non-positive %i", (v) => {
    expect(isValidQuantity(v)).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(isValidQuantity(1.5)).toBe(false);
  });

  it("rejects Infinity/-Infinity (not caught by isNaN alone)", () => {
    expect(isValidQuantity(Infinity)).toBe(false);
    expect(isValidQuantity(-Infinity)).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isValidQuantity(NaN)).toBe(false);
  });

  it("rejects non-number types", () => {
    expect(isValidQuantity("2")).toBe(false);
    expect(isValidQuantity(null)).toBe(false);
    expect(isValidQuantity(undefined)).toBe(false);
    expect(isValidQuantity({})).toBe(false);
  });
});

describe("cartLineKey", () => {
  it("distinguishes lines by variantId", () => {
    expect(cartLineKey({ productId: "p1", variantId: "v1" })).not.toBe(
      cartLineKey({ productId: "p1", variantId: "v2" })
    );
  });

  it("treats null variantId as its own key distinct from any variant", () => {
    expect(cartLineKey({ productId: "p1", variantId: null })).toBe("p1::");
  });
});

describe("mergeCartLines", () => {
  it("sums quantities for lines that already exist in the DB cart", () => {
    const merged = mergeCartLines(
      [{ productId: "p1", variantId: null, quantity: 2 }],
      [{ productId: "p1", variantId: null, quantity: 3 }]
    );
    expect(merged).toEqual([{ productId: "p1", variantId: null, quantity: 5 }]);
  });

  it("adds new lines from the guest cart that don't exist in the DB cart", () => {
    const merged = mergeCartLines(
      [{ productId: "p1", variantId: null, quantity: 2 }],
      [{ productId: "p2", variantId: null, quantity: 1 }]
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { productId: "p1", variantId: null, quantity: 2 },
        { productId: "p2", variantId: null, quantity: 1 },
      ])
    );
    expect(merged).toHaveLength(2);
  });

  it("distinguishes lines by variant, not just product", () => {
    const merged = mergeCartLines(
      [{ productId: "p1", variantId: "v1", quantity: 1 }],
      [{ productId: "p1", variantId: "v2", quantity: 1 }]
    );
    expect(merged).toHaveLength(2);
  });

  it("drops invalid guest lines (non-positive/non-integer quantity) instead of throwing", () => {
    const merged = mergeCartLines(
      [],
      [
        { productId: "p1", variantId: null, quantity: 0 },
        { productId: "p2", variantId: null, quantity: -1 },
        { productId: "p3", variantId: null, quantity: 1.5 },
        { productId: "p4", variantId: null, quantity: 2 },
      ]
    );
    expect(merged).toEqual([{ productId: "p4", variantId: null, quantity: 2 }]);
  });

  it("drops guest lines missing a productId", () => {
    const merged = mergeCartLines([], [{ productId: "", variantId: null, quantity: 1 }]);
    expect(merged).toEqual([]);
  });

  it("returns the DB cart unchanged when the guest cart is empty", () => {
    const dbLines = [{ productId: "p1", variantId: null, quantity: 4 }];
    expect(mergeCartLines(dbLines, [])).toEqual(dbLines);
  });
});

describe("roundMoney", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundMoney(19.999999999998)).toBe(20);
    expect(roundMoney(10.005)).toBeCloseTo(10.01, 2);
  });
});

describe("totalCartQuantity", () => {
  it("sums quantities across lines", () => {
    expect(totalCartQuantity([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });

  it("returns 0 for an empty cart", () => {
    expect(totalCartQuantity([])).toBe(0);
  });
});
