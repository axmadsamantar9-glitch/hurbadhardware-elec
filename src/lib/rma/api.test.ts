import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRmaForClaim, advanceRmaStatus, getRmaForClaimForUser, RmaError } from "./api";
import { writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    warrantyClaim: { findFirst: vi.fn() },
    rmaRequest: { findUnique: vi.fn() },
  },
}));

function makeTx() {
  return {
    warrantyClaim: { findUnique: vi.fn() },
    rmaRequest: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    rmaStatusHistory: { create: vi.fn() },
  } as unknown as Prisma.TransactionClient & {
    warrantyClaim: { findUnique: ReturnType<typeof vi.fn> };
    rmaRequest: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    rmaStatusHistory: { create: ReturnType<typeof vi.fn> };
  };
}

describe("createRmaForClaim (HUB-43 AC3)", () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = makeTx();
  });

  it("rejects when the claim is not found", async () => {
    tx.warrantyClaim.findUnique.mockResolvedValue(null);

    await expect(createRmaForClaim(tx, "claim-1", "admin-1")).rejects.toThrow(RmaError);
  });

  it("rejects when the claim's current status is not RMA-eligible", async () => {
    tx.warrantyClaim.findUnique.mockResolvedValue({ id: "claim-1", status: "REQUESTED" });

    await expect(createRmaForClaim(tx, "claim-1", "admin-1")).rejects.toMatchObject({
      code: "claim_not_rma_eligible",
    });
    expect(tx.rmaRequest.create).not.toHaveBeenCalled();
  });

  it.each(["SERVICE_REPAIR", "REPLACEMENT", "REFUND"])(
    "allows creation when the claim status is %s",
    async (status) => {
      tx.warrantyClaim.findUnique.mockResolvedValue({ id: "claim-1", status });
      tx.rmaRequest.findUnique.mockResolvedValue(null);
      tx.rmaRequest.create.mockResolvedValue({
        id: "rma-1",
        claimId: "claim-1",
        status: "REQUESTED",
      });

      const result = await createRmaForClaim(tx, "claim-1", "admin-1");

      expect(result.id).toBe("rma-1");
      expect(tx.rmaRequest.create).toHaveBeenCalledWith({
        data: { claimId: "claim-1", status: "REQUESTED" },
      });
    }
  );

  it("rejects when an RmaRequest already exists for the claim", async () => {
    tx.warrantyClaim.findUnique.mockResolvedValue({ id: "claim-1", status: "SERVICE_REPAIR" });
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "existing-rma" });

    await expect(createRmaForClaim(tx, "claim-1", "admin-1")).rejects.toMatchObject({
      code: "rma_already_exists",
    });
    expect(tx.rmaRequest.create).not.toHaveBeenCalled();
  });

  it("writes the initial REQUESTED history row and a rma.create audit log inside the same tx", async () => {
    tx.warrantyClaim.findUnique.mockResolvedValue({ id: "claim-1", status: "SERVICE_REPAIR" });
    tx.rmaRequest.findUnique.mockResolvedValue(null);
    tx.rmaRequest.create.mockResolvedValue({
      id: "rma-1",
      claimId: "claim-1",
      status: "REQUESTED",
    });

    await createRmaForClaim(tx, "claim-1", "admin-1");

    expect(tx.rmaStatusHistory.create).toHaveBeenCalledWith({
      data: { rmaId: "rma-1", status: "REQUESTED" },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: "admin-1",
        action: "rma.create",
        entityType: "rma_request",
        entityId: "rma-1",
      })
    );
  });
});

describe("advanceRmaStatus (HUB-43 AC2/AC5)", () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = makeTx();
  });

  it("rejects when the RMA is not found", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue(null);

    await expect(advanceRmaStatus(tx, "rma-1", "REVIEW", "admin-1")).rejects.toThrow(RmaError);
  });

  it("rejects an illegal transition and never writes history/audit", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "REQUESTED" });

    await expect(advanceRmaStatus(tx, "rma-1", "APPROVED", "admin-1")).rejects.toMatchObject({
      code: "invalid_transition",
    });
    expect(tx.rmaRequest.update).not.toHaveBeenCalled();
    expect(tx.rmaStatusHistory.create).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("sets receivedAt on APPROVED -> RECEIVED", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "APPROVED" });
    tx.rmaRequest.update.mockResolvedValue({ id: "rma-1", status: "RECEIVED" });

    await advanceRmaStatus(tx, "rma-1", "RECEIVED", "admin-1");

    const call = tx.rmaRequest.update.mock.calls[0][0];
    expect(call.data.receivedAt).toBeInstanceOf(Date);
    expect(call.data.inspectedAt).toBeUndefined();
    expect(call.data.completedAt).toBeUndefined();
  });

  it("sets inspectedAt on RECEIVED -> INSPECTING", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "RECEIVED" });
    tx.rmaRequest.update.mockResolvedValue({ id: "rma-1", status: "INSPECTING" });

    await advanceRmaStatus(tx, "rma-1", "INSPECTING", "admin-1");

    const call = tx.rmaRequest.update.mock.calls[0][0];
    expect(call.data.inspectedAt).toBeInstanceOf(Date);
    expect(call.data.receivedAt).toBeUndefined();
    expect(call.data.completedAt).toBeUndefined();
  });

  it.each(["REPAIR", "REPLACE", "REFUND"])("sets completedAt on %s -> COMPLETED", async (from) => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: from });
    tx.rmaRequest.update.mockResolvedValue({ id: "rma-1", status: "COMPLETED" });

    await advanceRmaStatus(tx, "rma-1", "COMPLETED", "admin-1");

    const call = tx.rmaRequest.update.mock.calls[0][0];
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it("does not set any timestamp on REQUESTED -> REVIEW", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "REQUESTED" });
    tx.rmaRequest.update.mockResolvedValue({ id: "rma-1", status: "REVIEW" });

    await advanceRmaStatus(tx, "rma-1", "REVIEW", "admin-1");

    const call = tx.rmaRequest.update.mock.calls[0][0];
    expect(call.data.receivedAt).toBeUndefined();
    expect(call.data.inspectedAt).toBeUndefined();
    expect(call.data.completedAt).toBeUndefined();
  });

  it("rejects conditionOnReceipt/inspectionNotes on a transition earlier than RECEIVED", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "REQUESTED" });

    await expect(
      advanceRmaStatus(tx, "rma-1", "REVIEW", "admin-1", { inspectionNotes: "too early" })
    ).rejects.toMatchObject({ code: "condition_fields_not_allowed" });
    expect(tx.rmaRequest.update).not.toHaveBeenCalled();
  });

  it("accepts conditionOnReceipt on APPROVED -> RECEIVED", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "APPROVED" });
    tx.rmaRequest.update.mockResolvedValue({ id: "rma-1", status: "RECEIVED" });

    await advanceRmaStatus(tx, "rma-1", "RECEIVED", "admin-1", { conditionOnReceipt: "USED" });

    const call = tx.rmaRequest.update.mock.calls[0][0];
    expect(call.data.conditionOnReceipt).toBe("USED");
  });

  it("writes a history row and rma.status_change audit log on every successful transition", async () => {
    tx.rmaRequest.findUnique.mockResolvedValue({ id: "rma-1", status: "REQUESTED" });
    tx.rmaRequest.update.mockResolvedValue({ id: "rma-1", status: "REVIEW" });

    await advanceRmaStatus(tx, "rma-1", "REVIEW", "admin-1");

    expect(tx.rmaStatusHistory.create).toHaveBeenCalledWith({
      data: { rmaId: "rma-1", status: "REVIEW" },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: "admin-1",
        action: "rma.status_change",
        entityId: "rma-1",
      })
    );
  });
});

describe("getRmaForClaimForUser (HUB-43 AC7, IDOR-safety)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null (not an error) when the claim does not belong to the user", async () => {
    vi.mocked(db.warrantyClaim.findFirst).mockResolvedValue(null);

    const result = await getRmaForClaimForUser("user-1", "claim-owned-by-someone-else");

    expect(result).toBeNull();
    expect(db.warrantyClaim.findFirst).toHaveBeenCalledWith({
      where: { id: "claim-owned-by-someone-else", warranty: { userId: "user-1" } },
      select: { id: true },
    });
    // Never even queries rmaRequest once ownership fails.
    expect(db.rmaRequest.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the claim belongs to the user but has no RMA yet", async () => {
    vi.mocked(db.warrantyClaim.findFirst).mockResolvedValue({ id: "claim-1" } as never);
    vi.mocked(db.rmaRequest.findUnique).mockResolvedValue(null as never);

    const result = await getRmaForClaimForUser("user-1", "claim-1");

    expect(result).toBeNull();
  });

  it("returns the RMA when the claim belongs to the user and has one", async () => {
    vi.mocked(db.warrantyClaim.findFirst).mockResolvedValue({ id: "claim-1" } as never);
    vi.mocked(db.rmaRequest.findUnique).mockResolvedValue({
      id: "rma-1",
      claimId: "claim-1",
      status: "REVIEW",
    } as never);

    const result = await getRmaForClaimForUser("user-1", "claim-1");

    expect(result).toMatchObject({ id: "rma-1" });
  });
});
