import { describe, it, expect } from "vitest";
import { flattenCategories, findCategoryBySlug } from "./category-tree";
import type { CategoryNode } from "@/lib/api/categories";

function makeCategory(overrides: Partial<CategoryNode>): CategoryNode {
  return {
    id: "id",
    nameEn: "Name",
    nameSo: "Magac",
    slug: "slug",
    parentId: null,
    imageUrl: null,
    sortOrder: 0,
    isActive: true,
    children: [],
    ...overrides,
  };
}

describe("flattenCategories", () => {
  it("returns parents before their children, depth-first", () => {
    const child = makeCategory({ id: "c1", slug: "child" });
    const root = makeCategory({ id: "r1", slug: "root", children: [child] });

    expect(flattenCategories([root])).toEqual([root, child]);
  });

  it("returns an empty array for an empty tree", () => {
    expect(flattenCategories([])).toEqual([]);
  });
});

describe("findCategoryBySlug", () => {
  it("finds a root-level category by slug", () => {
    const root = makeCategory({ id: "r1", slug: "smartphones" });
    expect(findCategoryBySlug([root], "smartphones")).toBe(root);
  });

  it("finds a nested category by slug", () => {
    const child = makeCategory({ id: "c1", slug: "nested" });
    const root = makeCategory({ id: "r1", slug: "root", children: [child] });
    expect(findCategoryBySlug([root], "nested")).toBe(child);
  });

  it("returns undefined for an unknown slug", () => {
    const root = makeCategory({ id: "r1", slug: "root" });
    expect(findCategoryBySlug([root], "does-not-exist")).toBeUndefined();
  });
});
