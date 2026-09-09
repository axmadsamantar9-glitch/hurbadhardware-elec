/**
 * Tests for GET/POST /api/admin/rma (HUB-43 AC3/AC6). Focus: ADMIN auth
 * gate, request validation, and RmaError -> HTTP status mapping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { RmaError } from "@/lib/rma/api";
import { Prisma } from "@prisma/client";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: vi.fn() },
}));
vi.mock("@/lib/rma/api", async () => {
  class RmaError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "RmaError";
    }
  }
  return {
    createRmaForClaim: vi.fn(),
    searchRmaRequests: vi.fn(),
    RmaError,
  };
});

const { createRmaForClaim, searchRmaRequests } = await import("@/lib/rma/api");

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "admin@hurbad.com", role: "ADMIN" as const },
};
const CUSTOMER_SESSION = {
  user: { id: "cust-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/rma", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/rma (HUB-43 AC3)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn({})) as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await POST(makePostRequest({ claimId: "claim-1" }));

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-ADMIN session", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await POST(makePostRequest({ claimId: "claim-1" }));

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid request body", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    const res = await POST(makePostRequest({}));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("validation_error");
  });

  it("returns 400 when createRmaForClaim rejects a non-eligible claim status", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(createRmaForClaim).mockRejectedValue(
      new RmaError("claim_not_rma_eligible", "not eligible")
    );

    const res = await POST(makePostRequest({ claimId: "claim-1" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("claim_not_rma_eligible");
  });

  it("returns 404 when the claim does not exist", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(createRmaForClaim).mockRejectedValue(new RmaError("claim_not_found", "not found"));

    const res = await POST(makePostRequest({ claimId: "claim-1" }));

    expect(res.status).toBe(404);
  });

  it("returns 201 and calls createRmaForClaim with the authenticated admin's id as actor", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(createRmaForClaim).mockResolvedValue({ id: "rma-1", claimId: "claim-1" } as never);

    const res = await POST(makePostRequest({ claimId: "claim-1" }));

    expect(res.status).toBe(201);
    expect(createRmaForClaim).toHaveBeenCalledWith(expect.anything(), "claim-1", "admin-1");
  });

  it("returns 409 (not 500) when a concurrent request already created an RMA for this claim", async () => {
    // Two near-simultaneous POSTs for the same claim can both pass
    // createRmaForClaim's app-level "no existing RMA" check before either
    // commits (TOCTOU) -- the DB's unique constraint on claim_id is the
    // real backstop and rejects the second insert with P2002. Confirm that
    // maps to a clean 409, not a generic 500 (security-reviewer finding).
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["claim_id"] },
    });
    vi.mocked(createRmaForClaim).mockRejectedValue(p2002);

    const res = await POST(makePostRequest({ claimId: "claim-1" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("rma_already_exists");
  });

  it("returns 500 for a P2002 on a different constraint (not claim_id)", async () => {
    // Sanity check the fix is scoped to the specific constraint, not any
    // P2002 whatsoever.
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["some_other_column"] },
    });
    vi.mocked(createRmaForClaim).mockRejectedValue(p2002);

    const res = await POST(makePostRequest({ claimId: "claim-1" }));

    expect(res.status).toBe(500);
  });
});

describe("GET /api/admin/rma (HUB-43 AC6)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/admin/rma"));

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-ADMIN session", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await GET(new Request("http://localhost/api/admin/rma"));

    expect(res.status).toBe(403);
  });

  it("returns 200 and forwards query params to searchRmaRequests", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(searchRmaRequests).mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });

    const res = await GET(
      new Request("http://localhost/api/admin/rma?claimId=claim-1&status=REVIEW")
    );

    expect(res.status).toBe(200);
    expect(searchRmaRequests).toHaveBeenCalledWith(
      expect.objectContaining({ claimId: "claim-1", status: "REVIEW" })
    );
  });
});
