import { describe, it, expect } from "vitest";
import { isValidRmaTransition, nextValidRmaStatuses } from "./transitions";
import type { RmaStatus } from "@prisma/client";

const ALL_STATUSES: RmaStatus[] = [
  "REQUESTED",
  "REVIEW",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "INSPECTING",
  "REPAIR",
  "REPLACE",
  "REFUND",
  "COMPLETED",
];

describe("isValidRmaTransition (HUB-43 AC2)", () => {
  const validPairs: Array<[RmaStatus, RmaStatus]> = [
    ["REQUESTED", "REVIEW"],
    ["REVIEW", "APPROVED"],
    ["REVIEW", "REJECTED"],
    ["APPROVED", "RECEIVED"],
    ["RECEIVED", "INSPECTING"],
    ["INSPECTING", "REPAIR"],
    ["INSPECTING", "REPLACE"],
    ["INSPECTING", "REFUND"],
    ["REPAIR", "COMPLETED"],
    ["REPLACE", "COMPLETED"],
    ["REFUND", "COMPLETED"],
  ];

  it.each(validPairs)("allows %s -> %s", (from, to) => {
    expect(isValidRmaTransition(from, to)).toBe(true);
  });

  it("rejects skipping a step (REQUESTED -> APPROVED)", () => {
    expect(isValidRmaTransition("REQUESTED", "APPROVED")).toBe(false);
  });

  it("rejects skipping a step (REQUESTED -> COMPLETED)", () => {
    expect(isValidRmaTransition("REQUESTED", "COMPLETED")).toBe(false);
  });

  it("rejects going backwards (INSPECTING -> RECEIVED)", () => {
    expect(isValidRmaTransition("INSPECTING", "RECEIVED")).toBe(false);
  });

  it("rejects self-transitions", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidRmaTransition(status, status)).toBe(false);
    }
  });

  it("REJECTED is terminal -- no transitions out", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidRmaTransition("REJECTED", status)).toBe(false);
    }
    expect(nextValidRmaStatuses("REJECTED")).toEqual([]);
  });

  it("COMPLETED is terminal -- no transitions out", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidRmaTransition("COMPLETED", status)).toBe(false);
    }
    expect(nextValidRmaStatuses("COMPLETED")).toEqual([]);
  });

  it("rejects APPROVED routing directly into inspection/resolution steps", () => {
    expect(isValidRmaTransition("APPROVED", "INSPECTING")).toBe(false);
    expect(isValidRmaTransition("APPROVED", "REPAIR")).toBe(false);
  });

  it("rejects REJECTED re-entering the workflow", () => {
    expect(isValidRmaTransition("REJECTED", "APPROVED")).toBe(false);
    expect(isValidRmaTransition("REJECTED", "RECEIVED")).toBe(false);
  });

  it("every status's outbound set matches isValidRmaTransition exactly", () => {
    for (const from of ALL_STATUSES) {
      const outbound = nextValidRmaStatuses(from);
      for (const to of ALL_STATUSES) {
        expect(isValidRmaTransition(from, to)).toBe(outbound.includes(to));
      }
    }
  });
});
