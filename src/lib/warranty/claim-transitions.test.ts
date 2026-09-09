import { describe, it, expect } from "vitest";
import { isValidClaimTransition, nextValidClaimStatuses } from "./claim-transitions";
import type { WarrantyClaimStatus } from "@prisma/client";

const ALL_STATUSES: WarrantyClaimStatus[] = [
  "REQUESTED",
  "ELIGIBILITY_REVIEW",
  "APPROVED",
  "REJECTED",
  "TROUBLESHOOTING",
  "SERVICE_REPAIR",
  "REPLACEMENT",
  "REFUND",
  "COMPLETED",
  "CLOSED",
];

describe("isValidClaimTransition (HUB-42 AC6 / PRD §6.9)", () => {
  const validPairs: Array<[WarrantyClaimStatus, WarrantyClaimStatus]> = [
    ["REQUESTED", "ELIGIBILITY_REVIEW"],
    ["ELIGIBILITY_REVIEW", "APPROVED"],
    ["ELIGIBILITY_REVIEW", "REJECTED"],
    ["APPROVED", "TROUBLESHOOTING"],
    ["REJECTED", "CLOSED"],
    ["TROUBLESHOOTING", "SERVICE_REPAIR"],
    ["SERVICE_REPAIR", "REPLACEMENT"],
    ["SERVICE_REPAIR", "REFUND"],
    ["REPLACEMENT", "COMPLETED"],
    ["REFUND", "COMPLETED"],
    ["COMPLETED", "CLOSED"],
  ];

  it.each(validPairs)("allows %s -> %s", (from, to) => {
    expect(isValidClaimTransition(from, to)).toBe(true);
  });

  it("rejects skipping a step (REQUESTED -> APPROVED)", () => {
    expect(isValidClaimTransition("REQUESTED", "APPROVED")).toBe(false);
  });

  it("rejects skipping a step (REQUESTED -> COMPLETED)", () => {
    expect(isValidClaimTransition("REQUESTED", "COMPLETED")).toBe(false);
  });

  it("rejects going backwards (SERVICE_REPAIR -> TROUBLESHOOTING)", () => {
    expect(isValidClaimTransition("SERVICE_REPAIR", "TROUBLESHOOTING")).toBe(false);
  });

  it("rejects self-transitions", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidClaimTransition(status, status)).toBe(false);
    }
  });

  it("CLOSED is terminal -- no transitions out", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidClaimTransition("CLOSED", status)).toBe(false);
    }
    expect(nextValidClaimStatuses("CLOSED")).toEqual([]);
  });

  it("rejects APPROVED routing directly into the repair pipeline's later steps", () => {
    expect(isValidClaimTransition("APPROVED", "SERVICE_REPAIR")).toBe(false);
    expect(isValidClaimTransition("APPROVED", "REPLACEMENT")).toBe(false);
  });

  it("rejects REJECTED re-entering the repair pipeline", () => {
    expect(isValidClaimTransition("REJECTED", "TROUBLESHOOTING")).toBe(false);
    expect(isValidClaimTransition("REJECTED", "APPROVED")).toBe(false);
  });

  it("every status's outbound set matches isValidClaimTransition exactly", () => {
    for (const from of ALL_STATUSES) {
      const outbound = nextValidClaimStatuses(from);
      for (const to of ALL_STATUSES) {
        expect(isValidClaimTransition(from, to)).toBe(outbound.includes(to));
      }
    }
  });
});
