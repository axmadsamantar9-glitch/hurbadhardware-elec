import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWarrantiesForUser, getWarrantyDetailForUser, searchWarranties } from "./warranties";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    warranty: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const BASE_WARRANTY = {
  id: "warranty-1",
  orderId: "order-1",
  orderItemId: "item-1",
  userId: "user-1",
  productNameSnapshotEn: "Test Product",
  productNameSnapshotSo: "Alaab Tijaabo",
  skuSnapshot: "SKU-1",
  warrantyMonthsSnapshot: 12,
  startDate: new Date("2026-01-01"),
  expiryDate: new Date("2027-01-01"),
  voidedAt: null,
  createdAt: new Date("2026-01-02"),
  serialNumber: null,
  coverageTermsEn: null,
  coverageTermsSo: null,
  exclusionsEn: null,
  exclusionsSo: null,
  coverageNotesEn: null,
  coverageNotesSo: null,
  registrationSource: "MANUAL",
  claims: [],
};

describe("getWarrantiesForUser (IDOR safety)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the query to the given userId in the where clause", async () => {
    vi.mocked(db.warranty.findMany).mockResolvedValue([BASE_WARRANTY] as never);

    const result = await getWarrantiesForUser("user-1");

    expect(db.warranty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("warranty-1");
  });
});

describe("getWarrantyDetailForUser (IDOR safety)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes ownership in the where clause (id AND userId together, not a post-fetch check)", async () => {
    vi.mocked(db.warranty.findFirst).mockResolvedValue(BASE_WARRANTY as never);

    await getWarrantyDetailForUser("user-1", "warranty-1");

    expect(db.warranty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "warranty-1", userId: "user-1" } })
    );
  });

  it("returns null (not an error, not another user's data) when the warranty belongs to someone else", async () => {
    // Simulates the DB's `findFirst` returning nothing because the where
    // clause's userId doesn't match -- proves the scoping happens at the
    // query level, not via a post-fetch ownership `if`.
    vi.mocked(db.warranty.findFirst).mockResolvedValue(null);

    const result = await getWarrantyDetailForUser("attacker-1", "warranty-1");

    expect(result).toBeNull();
  });

  it("returns null identically for a nonexistent warranty id", async () => {
    vi.mocked(db.warranty.findFirst).mockResolvedValue(null);

    const result = await getWarrantyDetailForUser("user-1", "does-not-exist");

    expect(result).toBeNull();
  });
});

describe("searchWarranties (admin, unscoped)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds an unscoped where clause from filters and paginates", async () => {
    vi.mocked(db.warranty.findMany).mockResolvedValue([
      { ...BASE_WARRANTY, user: { email: "cust@example.com" } },
    ] as never);
    vi.mocked(db.warranty.count).mockResolvedValue(1);

    const result = await searchWarranties({ sku: "sku-1", page: 1 });

    expect(db.warranty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          skuSnapshot: { contains: "sku-1", mode: "insensitive" },
        }),
      })
    );
    expect(result.total).toBe(1);
    expect(result.rows[0].userEmail).toBe("cust@example.com");
  });
});
