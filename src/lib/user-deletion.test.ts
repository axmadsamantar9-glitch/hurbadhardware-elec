import { describe, expect, it, vi, beforeEach } from "vitest";
import { softDeleteUser, ACTIVE_USER_FILTER, isSoftDeleted } from "./user-deletion";
import type { Prisma } from "@prisma/client";

vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeMockTx(
  overrides: {
    existingUser?: Record<string, unknown> | null;
    updatedUser?: Record<string, unknown>;
  } = {}
) {
  const existingUser =
    overrides.existingUser !== undefined
      ? overrides.existingUser
      : {
          id: "user-1",
          email: "jane.doe@example.com",
          name: "Jane Doe",
          phone: "+15551234567",
          deletedAt: null,
        };

  const auditCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
  const userUpdate = vi.fn().mockResolvedValue(
    overrides.updatedUser ?? {
      id: "user-1",
      email: null,
      name: null,
      phone: null,
      deletedAt: new Date("2026-08-24T00:00:00Z"),
    }
  );
  const userFindUnique = vi.fn().mockResolvedValue(existingUser);
  const addressUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const sessionDeleteMany = vi.fn().mockResolvedValue({ count: 2 });

  const tx = {
    user: { findUnique: userFindUnique, update: userUpdate },
    address: { updateMany: addressUpdateMany },
    session: { deleteMany: sessionDeleteMany },
    auditLog: { create: auditCreate },
  } as unknown as Prisma.TransactionClient;

  return { tx, userFindUnique, userUpdate, addressUpdateMany, sessionDeleteMany, auditCreate };
}

describe("softDeleteUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports softDeleteUser as a function", () => {
    expect(typeof softDeleteUser).toBe("function");
  });

  it("returns null when the user does not exist", async () => {
    const { tx, userUpdate } = makeMockTx({ existingUser: null });

    const result = await softDeleteUser(tx, {
      userId: "missing-user",
      actorId: "admin-1",
      reason: "GDPR request",
    });

    expect(result).toBeNull();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("sets deletedAt and nullifies email, phone, and name", async () => {
    const { tx, userUpdate } = makeMockTx();

    const result = await softDeleteUser(tx, {
      userId: "user-1",
      actorId: "user-1",
      reason: "Customer-initiated deletion",
    });

    expect(result?.didDelete).toBe(true);
    expect(result?.id).toBe("user-1");
    expect(result?.deletedAt).toBeInstanceOf(Date);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        email: null,
        phone: null,
        name: null,
        deletedAt: expect.any(Date),
      }),
    });
  });

  it("does not touch id, role, or createdAt (only sends the anonymized fields)", async () => {
    const { tx, userUpdate } = makeMockTx();

    await softDeleteUser(tx, { userId: "user-1", actorId: "user-1", reason: "test" });

    const callArgs = userUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArgs.data).not.toHaveProperty("id");
    expect(callArgs.data).not.toHaveProperty("role");
    expect(callArgs.data).not.toHaveProperty("createdAt");
  });

  it("anonymizes the user's addresses with placeholders instead of null (non-nullable columns)", async () => {
    const { tx, addressUpdateMany } = makeMockTx();

    await softDeleteUser(tx, { userId: "user-1", actorId: "user-1", reason: "test" });

    expect(addressUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: expect.objectContaining({
        fullName: "[deleted]",
        phone: "[deleted]",
        addressLine1: "[deleted]",
        city: "[deleted]",
      }),
    });
  });

  it("deletes DB-tracked session rows (does not revoke active JWT cookies — see known limitation)", async () => {
    const { tx, sessionDeleteMany } = makeMockTx();

    await softDeleteUser(tx, { userId: "user-1", actorId: "user-1", reason: "test" });

    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("is idempotent: re-deleting an already-deleted user is a no-op", async () => {
    const alreadyDeletedAt = new Date("2026-08-01T00:00:00Z");
    const { tx, userUpdate, addressUpdateMany, sessionDeleteMany, auditCreate } = makeMockTx({
      existingUser: {
        id: "user-1",
        email: null,
        name: null,
        phone: null,
        deletedAt: alreadyDeletedAt,
      },
    });

    const result = await softDeleteUser(tx, {
      userId: "user-1",
      actorId: "admin-1",
      reason: "duplicate request",
    });

    expect(result).toEqual({ id: "user-1", deletedAt: alreadyDeletedAt, didDelete: false });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(addressUpdateMany).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  describe("audit logging", () => {
    it("writes an audit entry with the deletion action, actor, and reason", async () => {
      const { tx, auditCreate } = makeMockTx();

      await softDeleteUser(tx, {
        userId: "user-1",
        actorId: "admin-42",
        reason: "GDPR request",
        correlationId: "corr-1",
      });

      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: "admin-42",
            action: "user.delete",
            entityType: "User",
            entityId: "user-1",
            reason: "GDPR request",
            correlationId: "corr-1",
          }),
        })
      );
    });

    it("does not leak plaintext PII into the audit before/after snapshot", async () => {
      const { tx, auditCreate } = makeMockTx();

      await softDeleteUser(tx, { userId: "user-1", actorId: "user-1", reason: "test" });

      const callArgs = auditCreate.mock.calls[0][0] as {
        data: { before: Record<string, unknown>; after: Record<string, unknown> };
      };

      // writePaymentAuditLog redacts PII-shaped keys (email, name, phone)
      // before the row is written.
      expect(callArgs.data.before.email).toBe("[redacted]");
      expect(callArgs.data.before.name).toBe("[redacted]");
      expect(callArgs.data.before.phone).toBe("[redacted]");
      expect(callArgs.data.after.email).toBe("[redacted]");
      expect(callArgs.data.after.name).toBe("[redacted]");
      expect(callArgs.data.after.phone).toBe("[redacted]");

      const serialized = JSON.stringify(callArgs.data);
      expect(serialized).not.toContain("jane.doe@example.com");
      expect(serialized).not.toContain("Jane Doe");
      expect(serialized).not.toContain("+15551234567");
    });

    it("does not log plaintext PII to the structured logger", async () => {
      const { logger } = await import("./logger");
      const { tx } = makeMockTx();

      await softDeleteUser(tx, { userId: "user-1", actorId: "user-1", reason: "test" });

      const infoCalls = vi.mocked(logger.info).mock.calls;
      const serialized = JSON.stringify(infoCalls);
      expect(serialized).not.toContain("jane.doe@example.com");
      expect(serialized).not.toContain("Jane Doe");
      expect(serialized).not.toContain("+15551234567");
    });
  });
});

describe("ACTIVE_USER_FILTER convention", () => {
  it("is a where-clause fragment excluding soft-deleted users", () => {
    expect(ACTIVE_USER_FILTER).toEqual({ deletedAt: null });
  });

  it("can be merged into a broader where clause", () => {
    const where = { ...ACTIVE_USER_FILTER, role: "CUSTOMER" };
    expect(where).toEqual({ deletedAt: null, role: "CUSTOMER" });
  });
});

describe("isSoftDeleted (used by src/auth.ts authorize() sign-in flow)", () => {
  // auth.ts imports this predicate and rejects sign-in for soft-deleted
  // users with the same generic "Invalid email or password" error used for
  // bad credentials (no account-deleted oracle). auth.ts itself cannot be
  // imported in the Vitest Node environment (see
  // docs/agents/learnings/qa-test.md), so this tests the extracted logic.
  it("returns true when deletedAt is set", () => {
    expect(isSoftDeleted({ deletedAt: new Date("2026-08-01T00:00:00Z") })).toBe(true);
  });

  it("returns false when deletedAt is null", () => {
    expect(isSoftDeleted({ deletedAt: null })).toBe(false);
  });

  it("returns false for a null or undefined user (findUnique found nothing)", () => {
    expect(isSoftDeleted(null)).toBe(false);
    expect(isSoftDeleted(undefined)).toBe(false);
  });
});
