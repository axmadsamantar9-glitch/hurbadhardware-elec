import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCategories } from "./categories";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    category: { findMany: vi.fn() },
  },
}));

const baseCategory = {
  imageUrl: null,
  isActive: true,
};

describe("getCategories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a nested tree matching the seeded category hierarchy", async () => {
    // Flat, active-only, sortOrder-asc rows exactly as the single query returns them.
    vi.mocked(db.category.findMany).mockResolvedValue([
      {
        ...baseCategory,
        id: "electronics",
        nameEn: "Electronics",
        nameSo: "Elektiroonig",
        slug: "electronics",
        parentId: null,
        sortOrder: 0,
      },
      {
        ...baseCategory,
        id: "hardware",
        nameEn: "Hardware",
        nameSo: "Qalab",
        slug: "hardware",
        parentId: null,
        sortOrder: 1,
      },
      {
        ...baseCategory,
        id: "smartphones",
        nameEn: "Smartphones",
        nameSo: "Taleefanada",
        slug: "smartphones",
        parentId: "electronics",
        sortOrder: 0,
      },
      {
        ...baseCategory,
        id: "laptops",
        nameEn: "Laptops",
        nameSo: "Laabtob",
        slug: "laptops",
        parentId: "electronics",
        sortOrder: 1,
      },
      {
        ...baseCategory,
        id: "power-tools",
        nameEn: "Power Tools",
        nameSo: "Qalabka Korontada",
        slug: "power-tools",
        parentId: "hardware",
        sortOrder: 0,
      },
    ] as never);

    const tree = await getCategories();

    expect(db.category.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    expect(tree).toHaveLength(2);
    expect(tree.map((c) => c.id)).toEqual(["electronics", "hardware"]);

    const electronics = tree.find((c) => c.id === "electronics")!;
    expect(electronics.children.map((c) => c.id)).toEqual(["smartphones", "laptops"]);
    expect(electronics.children[0].children).toEqual([]);

    const hardware = tree.find((c) => c.id === "hardware")!;
    expect(hardware.children.map((c) => c.id)).toEqual(["power-tools"]);
  });

  it("treats a category whose parent is inactive (not returned) as a root", async () => {
    vi.mocked(db.category.findMany).mockResolvedValue([
      {
        ...baseCategory,
        id: "orphan",
        nameEn: "Orphan",
        nameSo: "Orphan",
        slug: "orphan",
        parentId: "missing-parent",
        sortOrder: 0,
      },
    ] as never);

    const tree = await getCategories();
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("orphan");
  });

  it("returns an empty array when there are no active categories", async () => {
    vi.mocked(db.category.findMany).mockResolvedValue([]);
    const tree = await getCategories();
    expect(tree).toEqual([]);
  });

  it("omits a deactivated category from the tree without touching product data", async () => {
    // Simulates the state after an admin sets `isActive: false` on "laptops":
    // the `where: { isActive: true }` filter means the query itself never
    // returns the row, so it (and its children, if any) simply aren't in the
    // result — no cascading delete, no product mutation. getCategories()
    // has no join to Product at all, so a category's products are
    // structurally impossible for this function to touch.
    vi.mocked(db.category.findMany).mockResolvedValue([
      {
        ...baseCategory,
        id: "electronics",
        nameEn: "Electronics",
        nameSo: "Elektiroonig",
        slug: "electronics",
        parentId: null,
        sortOrder: 0,
      },
      {
        ...baseCategory,
        id: "smartphones",
        nameEn: "Smartphones",
        nameSo: "Taleefanada",
        slug: "smartphones",
        parentId: "electronics",
        sortOrder: 0,
      },
      // "laptops" (id would have been present here if active) is absent —
      // the mocked findMany result already reflects `isActive: false` having
      // excluded it via the `where` clause.
    ] as never);

    const tree = await getCategories();

    expect(db.category.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const electronics = tree.find((c) => c.id === "electronics")!;
    expect(electronics.children.map((c) => c.id)).toEqual(["smartphones"]);
    expect(tree.some((c) => c.id === "laptops")).toBe(false);
    expect(electronics.children.some((c) => c.id === "laptops")).toBe(false);
  });
});
