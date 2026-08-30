import { describe, it, expect } from "vitest";
import { absoluteUrl } from "./site-url";

describe("absoluteUrl", () => {
  it("joins a path that already starts with a slash", () => {
    expect(absoluteUrl("/en/products/galaxy-a55")).toMatch(
      /^https?:\/\/[^/]+\/en\/products\/galaxy-a55$/
    );
  });

  it("adds a leading slash when the path is missing one", () => {
    const withSlash = absoluteUrl("/en/category/smartphones");
    const withoutSlash = absoluteUrl("en/category/smartphones");
    expect(withoutSlash).toBe(withSlash);
  });

  it("never produces a double slash between the origin and the path", () => {
    const result = absoluteUrl("/en");
    const afterOrigin = result.replace(/^https?:\/\//, "");
    expect(afterOrigin).not.toContain("//");
  });
});
