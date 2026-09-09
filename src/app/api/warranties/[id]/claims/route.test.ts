/**
 * Tests for POST /api/warranties/[id]/claims (HUB-42 AC6). Focus: the
 * ownership-scoped IDOR-safety check (a claim against someone else's
 * warranty 404s, not 403 -- never leaks existence) and the auth gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: {
    warranty: { findFirst: vi.fn() },
    warrantyClaim: { create: vi.fn() },
  },
}));

const CUSTOMER_SESSION = {
  user: { id: "cust-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/warranties/warranty-1/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/warranties/[id]/claims (HUB-42 AC6)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await POST(makeRequest({ claimReason: "Broken" }), {
      params: Promise.resolve({ id: "warranty-1" }),
    });

    expect(res.status).toBe(401);
    expect(db.warranty.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the ownership check to id AND userId in the where clause", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);
    vi.mocked(db.warranty.findFirst).mockResolvedValue({ id: "warranty-1" } as never);
    vi.mocked(db.warrantyClaim.create).mockResolvedValue({
      id: "claim-1",
      status: "REQUESTED",
      createdAt: new Date(),
    } as never);

    await POST(makeRequest({ claimReason: "Broken screen" }), {
      params: Promise.resolve({ id: "warranty-1" }),
    });

    expect(db.warranty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "warranty-1", userId: "cust-1" } })
    );
  });

  it("returns 404 (never 403) when the warranty belongs to another user -- doesn't leak existence", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);
    // findFirst returns null because the where clause's userId doesn't match --
    // identical result to a nonexistent warranty id.
    vi.mocked(db.warranty.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ claimReason: "Broken screen" }), {
      params: Promise.resolve({ id: "someone-elses-warranty" }),
    });

    expect(res.status).toBe(404);
    expect(db.warrantyClaim.create).not.toHaveBeenCalled();
  });

  it("returns 404 identically for a nonexistent warranty id", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);
    vi.mocked(db.warranty.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ claimReason: "Broken screen" }), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 when claimReason is missing", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await POST(makeRequest({}), { params: Promise.resolve({ id: "warranty-1" }) });

    expect(res.status).toBe(400);
    expect(db.warranty.findFirst).not.toHaveBeenCalled();
  });

  it("ignores repairCostUsd/refundAmountUsd and other unexpected fields in the request body -- they cannot be set via this customer-facing route", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);
    vi.mocked(db.warranty.findFirst).mockResolvedValue({ id: "warranty-1" } as never);
    vi.mocked(db.warrantyClaim.create).mockResolvedValue({
      id: "claim-1",
      status: "REQUESTED",
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makeRequest({
        claimReason: "Broken screen",
        // A malicious/confused client trying to self-approve a payout or
        // force an admin-only status via the customer create route.
        repairCostUsd: 999,
        refundAmountUsd: 500,
        status: "COMPLETED",
        isOverride: true,
        userId: "someone-elses-id",
      }),
      { params: Promise.resolve({ id: "warranty-1" }) }
    );

    expect(res.status).toBe(201);
    const createCall = vi.mocked(db.warrantyClaim.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // Only the whitelisted fields reach Prisma -- status is hardcoded to
    // REQUESTED, userId comes from the session (not the body), and there is
    // no repairCostUsd/refundAmountUsd/isOverride key at all.
    expect(createCall.data).toEqual({
      warrantyId: "warranty-1",
      userId: "cust-1",
      claimReason: "Broken screen",
      customerDescription: null,
      status: "REQUESTED",
    });
    expect(createCall.data).not.toHaveProperty("repairCostUsd");
    expect(createCall.data).not.toHaveProperty("refundAmountUsd");
    expect(createCall.data).not.toHaveProperty("isOverride");
  });

  it("creates the claim with status REQUESTED on success", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);
    vi.mocked(db.warranty.findFirst).mockResolvedValue({ id: "warranty-1" } as never);
    vi.mocked(db.warrantyClaim.create).mockResolvedValue({
      id: "claim-1",
      status: "REQUESTED",
      createdAt: new Date(),
    } as never);

    const res = await POST(makeRequest({ claimReason: "Broken screen" }), {
      params: Promise.resolve({ id: "warranty-1" }),
    });

    expect(res.status).toBe(201);
    expect(db.warrantyClaim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          warrantyId: "warranty-1",
          userId: "cust-1",
          status: "REQUESTED",
        }),
      })
    );
  });
});
