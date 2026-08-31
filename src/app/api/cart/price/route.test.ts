import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { priceCartLines } from "@/lib/api/cart-pricing";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/cart-pricing", () => ({ priceCartLines: vi.fn() }));

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/cart/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/cart/price (HUR-190)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("works without authentication (guest cart re-pricing)", async () => {
    vi.mocked(priceCartLines).mockResolvedValue({ lines: [], subtotalUsd: 0 });

    const res = await POST(makeRequest({ items: [] }) as never);

    expect(res.status).toBe(200);
  });

  it("re-prices the given lines against live product data, never trusting a client-supplied price", async () => {
    vi.mocked(priceCartLines).mockResolvedValue({ lines: [], subtotalUsd: 0 });

    await POST(
      makeRequest({
        items: [{ productId: "p1", variantId: null, quantity: 2, unitPriceUsd: 0.01 }],
      }) as never
    );

    expect(priceCartLines).toHaveBeenCalledWith([
      { productId: "p1", variantId: null, quantity: 2 },
    ]);
  });

  it("filters out invalid (non-positive/non-integer) quantities before pricing", async () => {
    vi.mocked(priceCartLines).mockResolvedValue({ lines: [], subtotalUsd: 0 });

    await POST(
      makeRequest({
        items: [
          { productId: "p1", variantId: null, quantity: 0 },
          { productId: "p2", variantId: null, quantity: -1 },
          { productId: "p3", variantId: null, quantity: 2 },
        ],
      }) as never
    );

    expect(priceCartLines).toHaveBeenCalledWith([
      { productId: "p3", variantId: null, quantity: 2 },
    ]);
  });

  it("returns 400 for a malformed body", async () => {
    const res = await POST(makeRequest({ items: "nope" }) as never);
    expect(res.status).toBe(400);
    expect(priceCartLines).not.toHaveBeenCalled();
  });
});
