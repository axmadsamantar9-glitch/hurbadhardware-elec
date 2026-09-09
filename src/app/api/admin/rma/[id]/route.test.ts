/**
 * Tests for GET/PATCH /api/admin/rma/[id] (HUB-43 AC6). Focus: ADMIN auth
 * gate, Zod validation, and illegal-transition rejection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { RmaError } from "@/lib/rma/api";
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
    getRmaDetailForAdmin: vi.fn(),
    advanceRmaStatus: vi.fn(),
    RmaError,
  };
});

const { getRmaDetailForAdmin, advanceRmaStatus } = await import("@/lib/rma/api");

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "admin@hurbad.com", role: "ADMIN" as const },
};
const CUSTOMER_SESSION = {
  user: { id: "cust-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/rma/rma-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/rma/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/admin/rma/rma-1"), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-ADMIN session", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await GET(new Request("http://localhost/api/admin/rma/rma-1"), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when the RMA does not exist", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(getRmaDetailForAdmin).mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/admin/rma/rma-1"), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 with the RMA detail", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(getRmaDetailForAdmin).mockResolvedValue({ id: "rma-1", status: "REVIEW" } as never);

    const res = await GET(new Request("http://localhost/api/admin/rma/rma-1"), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/admin/rma/[id] (HUB-43 AC6)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn({})) as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ status: "REVIEW" }), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-ADMIN session", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await PATCH(makePatchRequest({ status: "REVIEW" }), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid status value", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);

    const res = await PATCH(makePatchRequest({ status: "NOT_A_REAL_STATUS" }), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("validation_error");
  });

  it("returns 400 when advanceRmaStatus rejects an illegal transition", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(advanceRmaStatus).mockRejectedValue(new RmaError("invalid_transition", "bad"));

    const res = await PATCH(makePatchRequest({ status: "APPROVED" }), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_transition");
  });

  it("returns 404 when the RMA does not exist", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(advanceRmaStatus).mockRejectedValue(new RmaError("rma_not_found", "not found"));

    const res = await PATCH(makePatchRequest({ status: "REVIEW" }), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 and calls advanceRmaStatus with the authenticated admin's id as actor", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(advanceRmaStatus).mockResolvedValue({ id: "rma-1", status: "REVIEW" } as never);

    const res = await PATCH(makePatchRequest({ status: "REVIEW" }), {
      params: Promise.resolve({ id: "rma-1" }),
    });

    expect(res.status).toBe(200);
    expect(advanceRmaStatus).toHaveBeenCalledWith(
      expect.anything(),
      "rma-1",
      "REVIEW",
      "admin-1",
      expect.anything()
    );
  });
});
