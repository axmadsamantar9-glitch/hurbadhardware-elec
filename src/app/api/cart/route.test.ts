import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, PATCH, DELETE } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import {
  getCartLinesPriced,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
} from "@/lib/api/cart";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/cart", () => ({
  getCartLinesPriced: vi.fn(),
  addCartItem: vi.fn(),
  updateCartItemQuantity: vi.fn(),
  removeCartItem: vi.fn(),
}));

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};
const EMPTY_CART = { lines: [], subtotalUsd: 0 };

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/cart", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/cart (HUR-190)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await GET();

      expect(res.status).toBe(401);
      expect(getCartLinesPriced).not.toHaveBeenCalled();
    });

    it("returns the current user's cart, scoped to session.user.id", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(getCartLinesPriced).mockResolvedValue(EMPTY_CART);

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(EMPTY_CART);
      expect(getCartLinesPriced).toHaveBeenCalledWith("user-1");
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await POST(makeRequest("POST", { productId: "p1", quantity: 1 }));

      expect(res.status).toBe(401);
      expect(addCartItem).not.toHaveBeenCalled();
    });

    it("adds an item for the authenticated user, ignoring any client-supplied userId or price", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(addCartItem).mockResolvedValue({ ok: true });
      vi.mocked(getCartLinesPriced).mockResolvedValue(EMPTY_CART);

      const res = await POST(
        makeRequest("POST", {
          productId: "p1",
          quantity: 2,
          userId: "attacker-supplied-id",
          priceUsd: 0.01,
        })
      );

      expect(res.status).toBe(200);
      expect(addCartItem).toHaveBeenCalledWith("user-1", {
        productId: "p1",
        variantId: undefined,
        quantity: 2,
      });
    });

    it("returns 400 for a non-positive quantity", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

      const res = await POST(makeRequest("POST", { productId: "p1", quantity: 0 }));

      expect(res.status).toBe(400);
      expect(addCartItem).not.toHaveBeenCalled();
    });

    it("returns 400 for a non-integer quantity", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

      const res = await POST(makeRequest("POST", { productId: "p1", quantity: 1.5 }));

      expect(res.status).toBe(400);
    });

    it("returns 404 when the product doesn't exist or is inactive", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(addCartItem).mockResolvedValue({ ok: false, error: "product_not_found" });

      const res = await POST(makeRequest("POST", { productId: "missing", quantity: 1 }));

      expect(res.status).toBe(404);
    });

    it("returns 400 for a malformed body", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

      const res = await POST(makeRequest("POST", {}));

      expect(res.status).toBe(400);
      expect(addCartItem).not.toHaveBeenCalled();
    });
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await PATCH(makeRequest("PATCH", { cartItemId: "item1", quantity: 3 }));

      expect(res.status).toBe(401);
      expect(updateCartItemQuantity).not.toHaveBeenCalled();
    });

    it("updates quantity for the authenticated user's own cart item", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(updateCartItemQuantity).mockResolvedValue({ ok: true });
      vi.mocked(getCartLinesPriced).mockResolvedValue(EMPTY_CART);

      const res = await PATCH(makeRequest("PATCH", { cartItemId: "item1", quantity: 3 }));

      expect(res.status).toBe(200);
      expect(updateCartItemQuantity).toHaveBeenCalledWith("user-1", "item1", 3);
    });

    it("returns 404 when the cart item isn't this user's", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(updateCartItemQuantity).mockResolvedValue({ ok: false, error: "not_found" });

      const res = await PATCH(
        makeRequest("PATCH", { cartItemId: "other-users-item", quantity: 3 })
      );

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      mockedAuth.mockResolvedValue(null);

      const res = await DELETE(makeRequest("DELETE", { cartItemId: "item1" }));

      expect(res.status).toBe(401);
      expect(removeCartItem).not.toHaveBeenCalled();
    });

    it("removes the item scoped to the authenticated user", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(removeCartItem).mockResolvedValue(undefined);
      vi.mocked(getCartLinesPriced).mockResolvedValue(EMPTY_CART);

      const res = await DELETE(makeRequest("DELETE", { cartItemId: "item1" }));

      expect(res.status).toBe(200);
      expect(removeCartItem).toHaveBeenCalledWith("user-1", "item1");
    });
  });

  describe("rate limiting", () => {
    it("returns 429 once the per-user threshold is exceeded", async () => {
      mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
      vi.mocked(getCartLinesPriced).mockResolvedValue(EMPTY_CART);

      const { RATE_LIMIT_THRESHOLDS } = await import("@/lib/config/rate-limits");
      for (let i = 0; i < RATE_LIMIT_THRESHOLDS.API; i++) {
        await GET();
      }
      const res = await GET();

      expect(res.status).toBe(429);
    });
  });
});
