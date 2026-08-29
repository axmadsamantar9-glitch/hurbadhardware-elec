import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSpecTemplate } from "./spec-templates";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    specTemplateKey: { findMany: vi.fn() },
  },
}));

describe("getSpecTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the category's spec template ordered by sortOrder", async () => {
    vi.mocked(db.specTemplateKey.findMany).mockResolvedValue([
      {
        id: "k1",
        categoryId: "smartphones",
        keySlug: "screen_size",
        keyEn: "Screen Size",
        keySo: "Cabbirka Shaashadda",
        sortOrder: 0,
        isMandatory: true,
      },
      {
        id: "k2",
        categoryId: "smartphones",
        keySlug: "ram",
        keyEn: "RAM",
        keySo: "RAM",
        sortOrder: 1,
        isMandatory: true,
      },
    ] as never);

    const result = await getSpecTemplate("smartphones");

    expect(db.specTemplateKey.findMany).toHaveBeenCalledWith({
      where: { categoryId: "smartphones" },
      orderBy: { sortOrder: "asc" },
    });
    expect(result).toHaveLength(2);
    expect(result.map((k) => k.keySlug)).toEqual(["screen_size", "ram"]);
    expect(result[0].isMandatory).toBe(true);
  });

  it("returns an empty array for a category with no template defined", async () => {
    vi.mocked(db.specTemplateKey.findMany).mockResolvedValue([]);

    const result = await getSpecTemplate("accessories");

    expect(db.specTemplateKey.findMany).toHaveBeenCalledWith({
      where: { categoryId: "accessories" },
      orderBy: { sortOrder: "asc" },
    });
    expect(result).toEqual([]);
  });

  it("returns an empty array for a category id that does not exist", async () => {
    vi.mocked(db.specTemplateKey.findMany).mockResolvedValue([]);

    const result = await getSpecTemplate("does-not-exist");

    expect(result).toEqual([]);
  });
});
