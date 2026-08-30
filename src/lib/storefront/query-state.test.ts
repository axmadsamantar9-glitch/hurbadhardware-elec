import { describe, it, expect } from "vitest";
import {
  parseStorefrontSearchParams,
  toGetProductsQuery,
  buildFilterHref,
  hasActiveFilters,
  DEFAULT_SORT,
  SORT_OPTIONS,
  type StorefrontQueryState,
} from "./query-state";

describe("parseStorefrontSearchParams", () => {
  it("returns all defaults for empty params (URLSearchParams)", () => {
    expect(parseStorefrontSearchParams(new URLSearchParams())).toEqual({
      q: "",
      category: "",
      brand: "",
      priceMin: "",
      priceMax: "",
      inStock: false,
      sort: "newest",
      page: 1,
    });
  });

  it("returns all defaults for an empty plain record", () => {
    expect(parseStorefrontSearchParams({})).toEqual({
      q: "",
      category: "",
      brand: "",
      priceMin: "",
      priceMax: "",
      inStock: false,
      sort: "newest",
      page: 1,
    });
  });

  it("parses populated URLSearchParams", () => {
    const params = new URLSearchParams(
      "q=laptop&category=laptops&brand=dell&priceMin=100&priceMax=999&inStock=true&sort=price_asc&page=3"
    );
    expect(parseStorefrontSearchParams(params)).toEqual({
      q: "laptop",
      category: "laptops",
      brand: "dell",
      priceMin: "100",
      priceMax: "999",
      inStock: true,
      sort: "price_asc",
      page: 3,
    });
  });

  it("parses a plain record, taking the first value of array entries", () => {
    const state = parseStorefrontSearchParams({ q: ["laptop", "phone"], page: "2" });
    expect(state.q).toBe("laptop");
    expect(state.page).toBe(2);
  });

  it("falls back to defaults for an unknown sort value", () => {
    expect(parseStorefrontSearchParams({ sort: "bogus" }).sort).toBe(DEFAULT_SORT);
  });

  it("treats inStock as false unless exactly 'true'", () => {
    expect(parseStorefrontSearchParams({ inStock: "false" }).inStock).toBe(false);
    expect(parseStorefrontSearchParams({ inStock: "1" }).inStock).toBe(false);
    expect(parseStorefrontSearchParams({ inStock: "true" }).inStock).toBe(true);
  });

  it("falls back to page 1 for non-numeric, zero, or negative page values", () => {
    expect(parseStorefrontSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseStorefrontSearchParams({ page: "0" }).page).toBe(1);
    expect(parseStorefrontSearchParams({ page: "-5" }).page).toBe(1);
  });
});

describe("toGetProductsQuery", () => {
  const base: StorefrontQueryState = {
    q: "",
    category: "",
    brand: "",
    priceMin: "",
    priceMax: "",
    inStock: false,
    sort: "newest",
    page: 1,
  };

  it("maps defaults to an unfiltered query", () => {
    expect(toGetProductsQuery(base, { limit: 24 })).toEqual({
      page: 1,
      limit: 24,
      search: "",
      category: "",
      brand: "",
      priceMin: undefined,
      priceMax: undefined,
      inStock: undefined,
      sort: "newest",
    });
  });

  it("trims search text and maps q -> search", () => {
    const state = { ...base, q: "  laptop  " };
    expect(toGetProductsQuery(state, { limit: 24 }).search).toBe("laptop");
  });

  it("parses priceMin/priceMax strings to numbers", () => {
    const state = { ...base, priceMin: "100", priceMax: "999.50" };
    const query = toGetProductsQuery(state, { limit: 24 });
    expect(query.priceMin).toBe(100);
    expect(query.priceMax).toBe(999.5);
  });

  it("ignores malformed price strings (NaN -> undefined)", () => {
    const state = { ...base, priceMin: "abc" };
    expect(toGetProductsQuery(state, { limit: 24 }).priceMin).toBeUndefined();
  });

  it("ignores non-finite price strings (Infinity -> undefined, not a Decimal crash)", () => {
    expect(
      toGetProductsQuery({ ...base, priceMin: "Infinity" }, { limit: 24 }).priceMin
    ).toBeUndefined();
    expect(
      toGetProductsQuery({ ...base, priceMax: "-Infinity" }, { limit: 24 }).priceMax
    ).toBeUndefined();
    expect(
      toGetProductsQuery({ ...base, priceMin: "1e400" }, { limit: 24 }).priceMin
    ).toBeUndefined();
  });

  it("maps inStock=true to true, false to undefined (no filter)", () => {
    expect(toGetProductsQuery({ ...base, inStock: true }, { limit: 24 }).inStock).toBe(true);
    expect(toGetProductsQuery({ ...base, inStock: false }, { limit: 24 }).inStock).toBeUndefined();
  });

  it("categoryOverride wins over state.category (category page pinning)", () => {
    const state = { ...base, category: "stray-value" };
    expect(toGetProductsQuery(state, { limit: 24, categoryOverride: "laptops" }).category).toBe(
      "laptops"
    );
  });
});

describe("buildFilterHref", () => {
  const base: StorefrontQueryState = {
    q: "",
    category: "",
    brand: "",
    priceMin: "",
    priceMax: "",
    inStock: false,
    sort: "newest",
    page: 1,
  };

  it("returns the bare pathname when all fields are at their default", () => {
    expect(buildFilterHref("/en", base, {})).toBe("/en");
  });

  it("serializes only non-default fields", () => {
    const href = buildFilterHref("/en", base, { q: "laptop" });
    expect(href).toBe("/en?q=laptop");
  });

  it("omits sort when it equals the default", () => {
    const href = buildFilterHref("/en", base, { sort: "newest" });
    expect(href).toBe("/en");
  });

  it("includes sort when it differs from the default", () => {
    const href = buildFilterHref("/en", base, { sort: "price_asc" });
    expect(href).toBe("/en?sort=price_asc");
  });

  it("resets page to 1 when a filter field changes", () => {
    const current = { ...base, page: 5 };
    const href = buildFilterHref("/en", current, { brand: "dell" });
    expect(href).toBe("/en?brand=dell");
  });

  it("preserves an explicit page patch (pagination links) without resetting it", () => {
    const current = { ...base, q: "laptop" };
    const href = buildFilterHref("/en", current, { page: 2 });
    expect(href).toBe("/en?q=laptop&page=2");
  });

  it("merges patch on top of existing filters, keeping unrelated fields", () => {
    const current = { ...base, q: "laptop", brand: "dell" };
    const href = buildFilterHref("/en", current, { inStock: true });
    expect(href).toBe("/en?q=laptop&brand=dell&inStock=true");
  });

  it("clears a field when the patch sets it back to the default", () => {
    const current = { ...base, category: "laptops" };
    const href = buildFilterHref("/en", current, { category: "" });
    expect(href).toBe("/en");
  });
});

describe("hasActiveFilters", () => {
  const base: StorefrontQueryState = {
    q: "",
    category: "",
    brand: "",
    priceMin: "",
    priceMax: "",
    inStock: false,
    sort: "price_desc",
    page: 3,
  };

  it("is false when only sort/page differ from default", () => {
    expect(hasActiveFilters(base)).toBe(false);
  });

  it.each([
    ["q", "laptop"],
    ["category", "laptops"],
    ["brand", "dell"],
    ["priceMin", "10"],
    ["priceMax", "10"],
  ] as const)("is true when %s is set", (field, value) => {
    expect(hasActiveFilters({ ...base, [field]: value })).toBe(true);
  });

  it("is true when inStock is true", () => {
    expect(hasActiveFilters({ ...base, inStock: true })).toBe(true);
  });
});

describe("SORT_OPTIONS", () => {
  it("covers every ProductSort exactly once", () => {
    const values = SORT_OPTIONS.map((o) => o.value).sort();
    expect(values).toEqual(["newest", "popularity", "price_asc", "price_desc", "rating"].sort());
  });
});
