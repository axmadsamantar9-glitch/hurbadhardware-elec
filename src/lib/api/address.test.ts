import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAddresses, createAddress, getOwnedAddress } from "./address";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    address: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe("listAddresses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes the query to the given userId", async () => {
    vi.mocked(db.address.findMany).mockResolvedValue([]);
    await listAddresses("user-1");
    expect(db.address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } })
    );
  });
});

describe("createAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an address owned by userId, never trusting a client-supplied userId", async () => {
    vi.mocked(db.address.create).mockResolvedValue({ id: "addr1" } as never);

    await createAddress("user-1", {
      fullName: "Jane Doe",
      phone: "+252600000000",
      addressLine1: "Street 1",
      city: "Mogadishu",
      country: "SO",
    });

    expect(db.address.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        fullName: "Jane Doe",
        phone: "+252600000000",
        addressLine1: "Street 1",
        addressLine2: null,
        city: "Mogadishu",
        state: null,
        country: "SO",
        isDefault: false,
      },
    });
  });
});

describe("getOwnedAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the address doesn't exist", async () => {
    vi.mocked(db.address.findUnique).mockResolvedValue(null);
    const result = await getOwnedAddress("user-1", "missing");
    expect(result).toBeNull();
  });

  it("returns null when the address belongs to a different user (never trust client-supplied addressId)", async () => {
    vi.mocked(db.address.findUnique).mockResolvedValue({
      id: "addr1",
      userId: "other-user",
    } as never);

    const result = await getOwnedAddress("user-1", "addr1");
    expect(result).toBeNull();
  });

  it("returns the address when it belongs to this user", async () => {
    vi.mocked(db.address.findUnique).mockResolvedValue({
      id: "addr1",
      userId: "user-1",
    } as never);

    const result = await getOwnedAddress("user-1", "addr1");
    expect(result).toEqual({ id: "addr1", userId: "user-1" });
  });
});
