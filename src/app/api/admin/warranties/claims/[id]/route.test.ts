/**
 * Tests for GET/PATCH /api/admin/warranties/claims/[id] (HUB-42 AC6/AC7).
 * Focus: ADMIN auth gate, illegal-transition rejection, and AC7's
 * override-requires-reason-when-warranty-not-ACTIVE rule.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { rateLimiter } from "@/lib/middleware/rate-limit";
import { writeAuditLog, writeOverrideAuditLog } from "@/lib/audit";
import type { Session } from "next-auth";

type AuthMock = () => Promise<Session | null>;
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn<AuthMock>>;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
  writeOverrideAuditLog: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    warrantyClaim: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "admin@hurbad.com", role: "ADMIN" as const },
};
const CUSTOMER_SESSION = {
  user: { id: "cust-1", email: "cust@hurbad.com", role: "CUSTOMER" as const },
};

function makeClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: "claim-1",
    status: "REQUESTED",
    isOverride: false,
    warranty: {
      id: "warranty-1",
      warrantyMonthsSnapshot: 12,
      startDate: new Date("2020-01-01"),
      voidedAt: null,
    },
    ...overrides,
  };
}

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/warranties/claims/claim-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/warranties/claims/[id] (HUB-42 AC6/AC7)", () => {
  beforeEach(() => {
    rateLimiter.clear();
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn({
        warrantyClaim: {
          update: vi
            .fn()
            .mockResolvedValue({ id: "claim-1", status: "ELIGIBILITY_REVIEW", isOverride: false }),
        },
      })) as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValue(null);

    const res = await PATCH(makePatchRequest({ status: "ELIGIBILITY_REVIEW" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-ADMIN session", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await PATCH(makePatchRequest({ status: "ELIGIBILITY_REVIEW" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 400 for an illegal transition (skipping a step)", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(makeClaim() as never);

    const res = await PATCH(makePatchRequest({ status: "APPROVED" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_transition");
  });

  it("allows a legal transition on an ACTIVE warranty without an override reason", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(
      makeClaim({
        warranty: {
          id: "warranty-1",
          warrantyMonthsSnapshot: 1200, // effectively never expires -> ACTIVE
          startDate: new Date("2020-01-01"),
          voidedAt: null,
        },
      }) as never
    );

    const res = await PATCH(makePatchRequest({ status: "ELIGIBILITY_REVIEW" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(200);
    expect(writeOverrideAuditLog).not.toHaveBeenCalled();
  });

  it("AC7: rejects with 400 when the warranty is not ACTIVE and no overrideReason is given for an approval/advance transition", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(
      makeClaim({
        warranty: {
          id: "warranty-1",
          warrantyMonthsSnapshot: 1, // long expired
          startDate: new Date("2020-01-01"),
          voidedAt: null,
        },
      }) as never
    );

    const res = await PATCH(makePatchRequest({ status: "ELIGIBILITY_REVIEW" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("override_reason_required");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("AC7: accepts the transition and writes a warranty.override audit row when overrideReason is present on a non-ACTIVE warranty", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(
      makeClaim({
        warranty: {
          id: "warranty-1",
          warrantyMonthsSnapshot: 1, // long expired
          startDate: new Date("2020-01-01"),
          voidedAt: null,
        },
      }) as never
    );

    const res = await PATCH(
      makePatchRequest({
        status: "ELIGIBILITY_REVIEW",
        overrideReason: "Manager approved goodwill exception",
      }),
      { params: Promise.resolve({ id: "claim-1" }) }
    );

    expect(res.status).toBe(200);
    expect(writeOverrideAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "admin-1",
        action: "warranty.override",
        entityType: "warranty_claim",
        entityId: "claim-1",
        reason: "Manager approved goodwill exception",
      })
    );
  });

  it('AC7 + security fix: rejects a whitespace-only overrideReason (" ") as invalid input, not as a valid override', async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(
      makeClaim({
        warranty: {
          id: "warranty-1",
          warrantyMonthsSnapshot: 1, // long expired
          startDate: new Date("2020-01-01"),
          voidedAt: null,
        },
      }) as never
    );

    const res = await PATCH(
      makePatchRequest({ status: "ELIGIBILITY_REVIEW", overrideReason: " " }),
      { params: Promise.resolve({ id: "claim-1" }) }
    );

    // The schema's .trim() before .min(1) means " " fails validation
    // entirely (400 validation_error) -- it must NOT be treated as a
    // present, non-empty overrideReason that satisfies AC7's override gate.
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("validation_error");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(writeOverrideAuditLog).not.toHaveBeenCalled();
  });

  it("does NOT require an override reason for a REJECTED transition even when the warranty is not ACTIVE", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(
      makeClaim({
        status: "ELIGIBILITY_REVIEW",
        warranty: {
          id: "warranty-1",
          warrantyMonthsSnapshot: 1, // long expired
          startDate: new Date("2020-01-01"),
          voidedAt: null,
        },
      }) as never
    );

    const res = await PATCH(makePatchRequest({ status: "REJECTED" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(200);
    expect(writeOverrideAuditLog).not.toHaveBeenCalled();
  });

  it("writes a warranty_claim.status_change audit row on every successful transition", async () => {
    mockedAuth.mockResolvedValue(ADMIN_SESSION as unknown as Session);
    vi.mocked(db.warrantyClaim.findUnique).mockResolvedValue(
      makeClaim({
        warranty: {
          id: "warranty-1",
          warrantyMonthsSnapshot: 1200,
          startDate: new Date("2020-01-01"),
          voidedAt: null,
        },
      }) as never
    );

    await PATCH(makePatchRequest({ status: "ELIGIBILITY_REVIEW" }), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "warranty_claim.status_change", entityId: "claim-1" })
    );
  });
});

describe("GET /api/admin/warranties/claims/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for a non-ADMIN session", async () => {
    mockedAuth.mockResolvedValue(CUSTOMER_SESSION as unknown as Session);

    const res = await GET(new Request("http://localhost/api/admin/warranties/claims/claim-1"), {
      params: Promise.resolve({ id: "claim-1" }),
    });

    expect(res.status).toBe(403);
  });
});
