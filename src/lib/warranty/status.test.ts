import { describe, it, expect } from "vitest";
import { calculateWarrantyStatus } from "./status";

const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("calculateWarrantyStatus (HUB-42 AC2)", () => {
  it("returns VOID when voidedAt is set, regardless of anything else", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: 12,
      startDate: new Date("2026-01-01"),
      voidedAt: new Date("2026-02-01"),
      now: NOW,
    });
    expect(result).toBe("VOID");
  });

  it("VOID takes precedence over an otherwise-ACTIVE warranty", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: 24,
      startDate: new Date("2026-01-01"),
      voidedAt: new Date("2026-05-01"),
      now: NOW,
    });
    expect(result).toBe("VOID");
  });

  it("returns VOID (not EXPIRED) when the warranty is BOTH past-expiry AND voided", () => {
    // warrantyMonths: 3 from 2026-01-01 expires 2026-04-01, well before `now`
    // (2026-06-01) -- this warranty IS genuinely expired on its own. voidedAt
    // is also set. Precedence rule #1 (voidedAt wins) must still fire first;
    // this is the exact case the two "VOID takes precedence" tests above
    // don't actually cover, since neither of their fixtures is past expiry.
    const result = calculateWarrantyStatus({
      warrantyMonths: 3,
      startDate: new Date("2026-01-01"),
      voidedAt: new Date("2026-05-01"),
      now: NOW, // 2026-06-01: past the 2026-04-01 expiry AND after voidedAt
    });
    expect(result).toBe("VOID");
  });

  it("returns NOT_COVERED when warrantyMonths is null", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: null,
      startDate: new Date("2026-01-01"),
      voidedAt: null,
      now: NOW,
    });
    expect(result).toBe("NOT_COVERED");
  });

  it("returns NOT_COVERED when startDate is null", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: 12,
      startDate: null,
      voidedAt: null,
      now: NOW,
    });
    expect(result).toBe("NOT_COVERED");
  });

  it("returns NOT_COVERED when both warrantyMonths and startDate are null", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: null,
      startDate: null,
      voidedAt: null,
      now: NOW,
    });
    expect(result).toBe("NOT_COVERED");
  });

  it("NOT_COVERED takes precedence over EXPIRED when startDate is missing", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: null,
      startDate: null,
      voidedAt: null,
      now: NOW,
    });
    expect(result).toBe("NOT_COVERED");
  });

  it("returns EXPIRED when now is past startDate + warrantyMonths", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: 3,
      startDate: new Date("2026-01-01"),
      voidedAt: null,
      now: NOW, // 2026-06-01, well past 2026-04-01 expiry
    });
    expect(result).toBe("EXPIRED");
  });

  it("returns ACTIVE when now is before startDate + warrantyMonths", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: 12,
      startDate: new Date("2026-01-01"),
      voidedAt: null,
      now: NOW, // 2026-06-01, well before 2027-01-01 expiry
    });
    expect(result).toBe("ACTIVE");
  });

  it("returns ACTIVE exactly at the boundary (now === expiry instant)", () => {
    const startDate = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date(startDate);
    now.setMonth(now.getMonth() + 3); // exactly 3 months later
    const result = calculateWarrantyStatus({
      warrantyMonths: 3,
      startDate,
      voidedAt: null,
      now,
    });
    // "now > expiry" is strictly greater-than, so the exact expiry instant is still ACTIVE.
    expect(result).toBe("ACTIVE");
  });

  it("returns EXPIRED one millisecond past the boundary", () => {
    const startDate = new Date("2026-01-01T00:00:00.000Z");
    const expiry = new Date(startDate);
    expiry.setMonth(expiry.getMonth() + 3);
    const now = new Date(expiry.getTime() + 1);
    const result = calculateWarrantyStatus({
      warrantyMonths: 3,
      startDate,
      voidedAt: null,
      now,
    });
    expect(result).toBe("EXPIRED");
  });

  it("defaults `now` to the real current time when omitted", () => {
    const result = calculateWarrantyStatus({
      warrantyMonths: 1200, // effectively never expires
      startDate: new Date("2020-01-01"),
      voidedAt: null,
    });
    expect(result).toBe("ACTIVE");
  });

  it("never returns EXPIRING_SOON (no confirmed threshold -- see doc comment)", () => {
    // Sweep a range of inputs across all four other branches and confirm
    // EXPIRING_SOON never appears.
    const inputs = [
      { warrantyMonths: null, startDate: null, voidedAt: null },
      { warrantyMonths: 12, startDate: new Date("2026-01-01"), voidedAt: new Date("2026-02-01") },
      { warrantyMonths: 1, startDate: new Date("2020-01-01"), voidedAt: null },
      { warrantyMonths: 120, startDate: new Date("2020-01-01"), voidedAt: null },
    ];
    for (const input of inputs) {
      expect(calculateWarrantyStatus({ ...input, now: NOW })).not.toBe("EXPIRING_SOON");
    }
  });
});
