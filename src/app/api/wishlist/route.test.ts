import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { addToWishlist, removeFromWishlist, getWishlistProducts } from "@/lib/api/wishlist";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api/wishlist", () => ({
  addToWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  getWishlistProducts: vi.fn(),
}));

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};
const OTHER_USER_SESSION = {
  user: { id: "user-2", email: "other@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/wishlist", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/wishlist (HUB-35)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await GET();

      expect(res.status).toBe(401);
      expect(getWishlistProducts).not.toHaveBeenCalled();
    });

    it("returns the current user's wishlist, scoped to session.user.id", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(getWishlistProducts).mockResolvedValue([]);

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ products: [] });
      expect(getWishlistProducts).toHaveBeenCalledWith("user-1");
    });

    it("never uses a different user's id even if one were somehow supplied elsewhere", async () => {
      mockedAuth.mockResolvedValue(OTHER_USER_SESSION as unknown as Session);
      vi.mocked(getWishlistProducts).mockResolvedValue([]);

      await GET();

      expect(getWishlistProducts).toHaveBeenCalledWith("user-2");
      expect(getWishlistProducts).not.toHaveBeenCalledWith("user-1");
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await POST(makeRequest("POST", { productId: "p1" }));

      expect(res.status).toBe(401);
      expect(addToWishlist).not.toHaveBeenCalled();
    });

    it("adds a product to the authenticated user's wishlist, ignoring any client-supplied userId", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(addToWishlist).mockResolvedValue({ ok: true });

      const res = await POST(
        makeRequest("POST", { productId: "p1", userId: "attacker-supplied-id" })
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ ok: true });
      // Only the session-derived id is ever passed through — the
      // client-supplied `userId` field in the body is never read.
      expect(addToWishlist).toHaveBeenCalledWith("user-1", "p1");
    });

    it("returns 404 when the product doesn't exist", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(addToWishlist).mockResolvedValue({ ok: false, error: "product_not_found" });

      const res = await POST(makeRequest("POST", { productId: "missing" }));

      expect(res.status).toBe(404);
    });

    it("returns 400 for a malformed body", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

      const res = await POST(makeRequest("POST", {}));

      expect(res.status).toBe(400);
      expect(addToWishlist).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await DELETE(makeRequest("DELETE", { productId: "p1" }));

      expect(res.status).toBe(401);
      expect(removeFromWishlist).not.toHaveBeenCalled();
    });

    it("removes a product from the authenticated user's wishlist only", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(removeFromWishlist).mockResolvedValue(undefined);

      const res = await DELETE(makeRequest("DELETE", { productId: "p1" }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ ok: true });
      expect(removeFromWishlist).toHaveBeenCalledWith("user-1", "p1");
    });

    it("returns 400 for a malformed body", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

      const res = await DELETE(makeRequest("DELETE", {}));

      expect(res.status).toBe(400);
      expect(removeFromWishlist).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("returns 429 once the per-user threshold is exceeded", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(getWishlistProducts).mockResolvedValue([]);

      const { RATE_LIMIT_THRESHOLDS } = await import("@/lib/config/rate-limits");
      for (let i = 0; i < RATE_LIMIT_THRESHOLDS.API; i++) {
        await GET();
      }
      const res = await GET();

      expect(res.status).toBe(429);
    });
  });
});
