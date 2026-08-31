import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { auth } from "@/auth";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { mergeGuestCartIntoDb, getCartLinesPriced } from "@/lib/api/cart";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/cart", () => ({
  mergeGuestCartIntoDb: vi.fn(),
  getCartLinesPriced: vi.fn(),
}));

const USER_SESSION = {
  user: { id: "user-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/cart/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/cart/merge (HUR-190)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await POST(makeRequest({ items: [] }));

    expect(res.status).toBe(401);
    expect(mergeGuestCartIntoDb).not.toHaveBeenCalled();
  });

  it("merges the guest cart into the authenticated user's DB cart, ignoring any client-supplied userId", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);
    vi.mocked(mergeGuestCartIntoDb).mockResolvedValue(undefined);
    vi.mocked(getCartLinesPriced).mockResolvedValue({ lines: [], subtotalUsd: 0 });

    const res = await POST(
      makeRequest({
        items: [{ productId: "p1", variantId: null, quantity: 2 }],
        userId: "attacker-supplied-id",
      })
    );

    expect(res.status).toBe(200);
    expect(mergeGuestCartIntoDb).toHaveBeenCalledWith("user-1", [
      { productId: "p1", variantId: null, quantity: 2 },
    ]);
  });

  it("returns 400 for a malformed body", async () => {
    mockedAuth.mockResolvedValue(USER_SESSION as unknown as Session);

    const res = await POST(makeRequest({ items: "not-an-array" }));

    expect(res.status).toBe(400);
    expect(mergeGuestCartIntoDb).not.toHaveBeenCalled();
  });
});
