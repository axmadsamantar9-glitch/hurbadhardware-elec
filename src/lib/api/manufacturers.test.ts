import { describe, it, expect, beforeEach, vi } from "vitest";
import { getManufacturers } from "./manufacturers";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    manufacturer: { findMany: vi.fn() },
  },
}));

describe("getManufacturers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns active manufacturers ordered by nameEn", async () => {
    vi.mocked(db.manufacturer.findMany).mockResolvedValue([
      { id: "m1", nameEn: "Bosch", nameSo: "Bosch", slug: "bosch", logoUrl: null, isActive: true },
    ] as never);

    const result = await getManufacturers();

    expect(db.manufacturer.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { nameEn: "asc" },
    });
    expect(result).toHaveLength(1);
  });

  it("returns an empty list when no active manufacturers exist", async () => {
    vi.mocked(db.manufacturer.findMany).mockResolvedValue([]);
    const result = await getManufacturers();
    expect(result).toEqual([]);
  });
});
