import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { listAddresses, createAddress } from "@/lib/api/address";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api/address", () => ({
  listAddresses: vi.fn(),
  createAddress: vi.fn(),
}));

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/address", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/address (HUR-191)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(401);
      expect(listAddresses).not.toHaveBeenCalled();
    });

    it("returns the current user's addresses, scoped to session.user.id", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(listAddresses).mockResolvedValue([]);

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ addresses: [] });
      expect(listAddresses).toHaveBeenCalledWith("user-1");
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);
      const res = await POST(makeRequest("POST", {}));
      expect(res.status).toBe(401);
      expect(createAddress).not.toHaveBeenCalled();
    });

    it("creates an address for the session user, ignoring any client-supplied userId", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(createAddress).mockResolvedValue({ id: "addr1" } as never);

      const res = await POST(
        makeRequest("POST", {
          userId: "attacker-supplied-id",
          fullName: "Jane Doe",
          phone: "+252600000000",
          addressLine1: "Street 1",
          city: "Mogadishu",
          country: "SO",
        })
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json).toEqual({ address: { id: "addr1" } });
      expect(createAddress).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ fullName: "Jane Doe" })
      );
    });

    it("returns 400 for a malformed body", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      const res = await POST(makeRequest("POST", { fullName: "Jane" }));
      expect(res.status).toBe(400);
      expect(createAddress).not.toHaveBeenCalled();
    });
  });
});
