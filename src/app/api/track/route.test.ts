import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { trackOrder } from "@/lib/api/orders";
import { RATE_LIMIT_THRESHOLDS } from "@/lib/config/rate-limits";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/orders", () => ({ trackOrder: vi.fn() }));

function makeRequest(body: unknown, opts: { ip?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const TRACKED = {
  id: "order-abc123",
  status: "SHIPPED" as const,
  trackingNumber: "TRK-1",
  items: [{ nameSnapshotEn: "Widget", nameSnapshotSo: "Widget SO", quantity: 2 }],
  statusHistory: [{ status: "PLACED" as const, createdAt: new Date("2026-01-01") }],
  totals: { subtotalUsd: 20, discountUsd: 0, taxUsd: 0, totalUsd: 20 },
};

describe("POST /api/track (HUB-39, U14)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("returns 400 for a malformed body and never calls trackOrder", async () => {
    const res = await POST(makeRequest({ orderIdSuffix: "" }) as never);
    expect(res.status).toBe(400);
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("returns the reduced public shape on a match, with no shipping/payment fields leaked", async () => {
    vi.mocked(trackOrder).mockResolvedValue(TRACKED);

    const res = await POST(
      makeRequest({ orderIdSuffix: "c123", email: "owner@example.com" }, { ip: "1.1.1.1" }) as never
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      id: TRACKED.id,
      status: TRACKED.status,
      trackingNumber: TRACKED.trackingNumber,
      items: TRACKED.items,
      statusHistory: [
        { status: "PLACED", createdAt: TRACKED.statusHistory[0].createdAt.toISOString() },
      ],
      totals: TRACKED.totals,
    });
    expect(json).not.toHaveProperty("shippingAddress");
    expect(json).not.toHaveProperty("paymentMethod");
    expect(json).not.toHaveProperty("email");
  });

  it("returns the identical generic 404 whether the suffix doesn't exist or the email doesn't match (never differentiates)", async () => {
    vi.mocked(trackOrder).mockResolvedValue(null);

    const res1 = await POST(
      makeRequest({ orderIdSuffix: "zzzz", email: "a@example.com" }, { ip: "2.2.2.2" }) as never
    );
    const json1 = await res1.json();

    rateLimiter.clear();
    vi.mocked(trackOrder).mockResolvedValue(null);
    const res2 = await POST(
      makeRequest({ orderIdSuffix: "c123", email: "wrong@example.com" }, { ip: "2.2.2.2" }) as never
    );
    const json2 = await res2.json();

    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
    expect(json1).toEqual({ error: "not_found" });
    expect(json2).toEqual(json1);
  });

  it("returns 500 with a generic message when trackOrder throws", async () => {
    vi.mocked(trackOrder).mockRejectedValue(new Error("db exploded"));

    const res = await POST(
      makeRequest({ orderIdSuffix: "c123", email: "a@example.com" }, { ip: "3.3.3.3" }) as never
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("internal_error");
    expect(JSON.stringify(json)).not.toContain("db exploded");
  });

  it("rejects with 429 once the IP-scoped rate limit is exhausted, WITHOUT ever calling trackOrder for the rejected request", async () => {
    vi.mocked(trackOrder).mockResolvedValue(null);

    for (let i = 0; i < RATE_LIMIT_THRESHOLDS.TRACK; i++) {
      // Vary the suffix each time so only the IP bucket is being driven down,
      // proving the IP-scoped limit alone is sufficient to reject.
      await POST(
        makeRequest(
          { orderIdSuffix: `suf${i}`, email: "a@example.com" },
          { ip: "9.9.9.9" }
        ) as never
      );
    }
    vi.mocked(trackOrder).mockClear();

    const res = await POST(
      makeRequest({ orderIdSuffix: "final", email: "a@example.com" }, { ip: "9.9.9.9" }) as never
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("rate_limit_exceeded");
    // The rate-limit check must short-circuit BEFORE the DB lookup.
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("rejects with 429 once the suffix-scoped rate limit is exhausted, even from many different IPs, WITHOUT calling trackOrder", async () => {
    vi.mocked(trackOrder).mockResolvedValue(null);

    for (let i = 0; i < RATE_LIMIT_THRESHOLDS.TRACK; i++) {
      // Vary the IP each time so only the suffix bucket is being driven down,
      // proving the suffix-scoped limit alone is sufficient to reject (i.e.
      // an attacker can't defeat it by rotating IPs against one suffix).
      await POST(
        makeRequest(
          { orderIdSuffix: "shared-suffix", email: "a@example.com" },
          { ip: `10.0.0.${i}` }
        ) as never
      );
    }
    vi.mocked(trackOrder).mockClear();

    const res = await POST(
      makeRequest(
        { orderIdSuffix: "shared-suffix", email: "a@example.com" },
        { ip: "10.0.0.250" }
      ) as never
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("rate_limit_exceeded");
    expect(trackOrder).not.toHaveBeenCalled();
  });

  it("allows a request through when neither bucket is exhausted", async () => {
    vi.mocked(trackOrder).mockResolvedValue(null);

    const res = await POST(
      makeRequest({ orderIdSuffix: "abcd", email: "a@example.com" }, { ip: "5.5.5.5" }) as never
    );

    expect(res.status).toBe(404);
    expect(trackOrder).toHaveBeenCalledWith("abcd", "a@example.com");
  });
});
