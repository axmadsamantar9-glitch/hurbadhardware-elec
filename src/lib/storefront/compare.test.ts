import { describe, it, expect } from "vitest";
import {
  MAX_COMPARE_PRODUCTS,
  toggleCompareId,
  removeCompareId,
  clearCompareIds,
  parseCompareIdsParam,
  buildCompareHref,
  buildComparisonRows,
} from "./compare";

function spec(keyEn: string, valueEn: string, keySo = keyEn, valueSo = valueEn) {
  return { keyEn, keySo, valueEn, valueSo };
}

describe("toggleCompareId", () => {
  it("adds a product id not currently selected", () => {
    const result = toggleCompareId([], "p1");
    expect(result).toEqual({ ids: ["p1"], status: "added" });
  });

  it("removes a product id already selected (toggle off)", () => {
    const result = toggleCompareId(["p1", "p2"], "p1");
    expect(result).toEqual({ ids: ["p2"], status: "removed" });
  });

  it("allows selecting exactly up to the cap (3)", () => {
    let ids: string[] = [];
    ids = toggleCompareId(ids, "p1").ids;
    ids = toggleCompareId(ids, "p2").ids;
    const result = toggleCompareId(ids, "p3");
    expect(result).toEqual({ ids: ["p1", "p2", "p3"], status: "added" });
  });

  it("rejects a 4th distinct selection when already at the cap, leaving the set unchanged", () => {
    const full = ["p1", "p2", "p3"];
    const result = toggleCompareId(full, "p4");
    expect(result.status).toBe("rejected_full");
    expect(result.ids).toEqual(["p1", "p2", "p3"]);
  });

  it("still allows removing (toggling off) an existing selection while at the cap", () => {
    const full = ["p1", "p2", "p3"];
    const result = toggleCompareId(full, "p2");
    expect(result).toEqual({ ids: ["p1", "p3"], status: "removed" });
  });

  it("respects a custom max", () => {
    const result = toggleCompareId(["p1"], "p2", 1);
    expect(result.status).toBe("rejected_full");
    expect(result.ids).toEqual(["p1"]);
  });

  it("does not mutate the input array", () => {
    const input = ["p1"];
    toggleCompareId(input, "p2");
    expect(input).toEqual(["p1"]);
  });
});

describe("removeCompareId", () => {
  it("removes the given id", () => {
    expect(removeCompareId(["p1", "p2"], "p1")).toEqual(["p2"]);
  });

  it("is a no-op (idempotent) when the id is not present", () => {
    expect(removeCompareId(["p1"], "not-there")).toEqual(["p1"]);
  });

  it("removing one id leaves the others untouched", () => {
    expect(removeCompareId(["p1", "p2", "p3"], "p2")).toEqual(["p1", "p3"]);
  });
});

describe("clearCompareIds", () => {
  it("returns an empty array", () => {
    expect(clearCompareIds()).toEqual([]);
  });
});

describe("parseCompareIdsParam", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(parseCompareIdsParam(null)).toEqual([]);
    expect(parseCompareIdsParam(undefined)).toEqual([]);
    expect(parseCompareIdsParam("")).toEqual([]);
  });

  it("splits a comma-separated list", () => {
    expect(parseCompareIdsParam("p1,p2,p3")).toEqual(["p1", "p2", "p3"]);
  });

  it("trims whitespace and drops empty segments", () => {
    expect(parseCompareIdsParam(" p1 ,, p2 ,")).toEqual(["p1", "p2"]);
  });

  it("deduplicates ids", () => {
    expect(parseCompareIdsParam("p1,p2,p1")).toEqual(["p1", "p2"]);
  });

  it("caps at max (default 3), keeping the first occurrences", () => {
    expect(parseCompareIdsParam("p1,p2,p3,p4,p5")).toEqual(["p1", "p2", "p3"]);
  });

  it("respects a custom max", () => {
    expect(parseCompareIdsParam("p1,p2,p3", 1)).toEqual(["p1"]);
  });
});

describe("buildCompareHref", () => {
  it("builds a locale-prefixed href with no query string when ids is empty", () => {
    expect(buildCompareHref("en", [])).toBe("/en/products/compare");
  });

  it("builds a locale-prefixed href with a comma-joined ids query param", () => {
    expect(buildCompareHref("so", ["p1", "p2"])).toBe("/so/products/compare?ids=p1,p2");
  });

  it("URL-encodes each id", () => {
    expect(buildCompareHref("en", ["a b"])).toBe("/en/products/compare?ids=a%20b");
  });
});

describe("MAX_COMPARE_PRODUCTS", () => {
  it("is 3, per PRD R5", () => {
    expect(MAX_COMPARE_PRODUCTS).toBe(3);
  });
});

describe("buildComparisonRows", () => {
  it("returns [] for no products", () => {
    expect(buildComparisonRows([])).toEqual([]);
  });

  it("returns [] when every product has no specs", () => {
    expect(buildComparisonRows([[], []])).toEqual([]);
  });

  it("aligns a shared spec key across two products by keyEn (case-insensitive)", () => {
    const rows = buildComparisonRows([[spec("RAM", "8GB")], [spec("ram", "16GB")]]);
    expect(rows).toEqual([
      { keyEn: "RAM", keySo: "RAM", valuesEn: ["8GB", "16GB"], valuesSo: ["8GB", "16GB"] },
    ]);
  });

  it("leaves a gap (undefined) for a product missing a spec another product has", () => {
    const rows = buildComparisonRows([
      [spec("RAM", "8GB"), spec("Battery", "4000mAh")],
      [spec("RAM", "16GB")],
    ]);
    expect(rows).toEqual([
      { keyEn: "RAM", keySo: "RAM", valuesEn: ["8GB", "16GB"], valuesSo: ["8GB", "16GB"] },
      {
        keyEn: "Battery",
        keySo: "Battery",
        valuesEn: ["4000mAh", undefined],
        valuesSo: ["4000mAh", undefined],
      },
    ]);
  });

  it("appends a key unique to a later product after the earlier products' keys", () => {
    const rows = buildComparisonRows([
      [spec("RAM", "8GB")],
      [spec("RAM", "16GB"), spec("Screen Size", "6.5in")],
    ]);
    expect(rows.map((r) => r.keyEn)).toEqual(["RAM", "Screen Size"]);
    expect(rows[1]).toEqual({
      keyEn: "Screen Size",
      keySo: "Screen Size",
      valuesEn: [undefined, "6.5in"],
      valuesSo: [undefined, "6.5in"],
    });
  });

  it("handles 3 products (the real max), preserving column order", () => {
    const rows = buildComparisonRows([
      [spec("RAM", "8GB")],
      [spec("RAM", "16GB")],
      [spec("RAM", "32GB")],
    ]);
    expect(rows).toEqual([
      {
        keyEn: "RAM",
        keySo: "RAM",
        valuesEn: ["8GB", "16GB", "32GB"],
        valuesSo: ["8GB", "16GB", "32GB"],
      },
    ]);
  });

  it("does not mutate the input arrays", () => {
    const p1 = [spec("RAM", "8GB")];
    const p2 = [spec("Battery", "4000mAh")];
    buildComparisonRows([p1, p2]);
    expect(p1).toEqual([spec("RAM", "8GB")]);
    expect(p2).toEqual([spec("Battery", "4000mAh")]);
  });
});
