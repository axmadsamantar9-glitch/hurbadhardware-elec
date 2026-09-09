/**
 * Pure warranty status calculation (HUB-42 AC2).
 *
 * Deliberately has no database/Prisma dependency -- callers (registration,
 * detail views, override checks) all compute status from a plain snapshot of
 * a Warranty row's relevant fields, so this function stays trivially unit
 * testable and side-effect free.
 */

export interface CalculateWarrantyStatusInput {
  /** Snapshot of Product.warrantyMonths at registration time (nullable -- see schema.prisma comment). */
  warrantyMonths: number | null | undefined;
  startDate: Date | null | undefined;
  voidedAt: Date | null | undefined;
  /** Injectable "now" for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

export type WarrantyStatusResult = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "VOID" | "NOT_COVERED";

/**
 * Precedence order (evaluated top to bottom, first match wins):
 *   1. `voidedAt` is set                              -> VOID
 *   2. `warrantyMonths` or `startDate` is null         -> NOT_COVERED
 *   3. `now` is past `startDate + warrantyMonths`      -> EXPIRED
 *   4. otherwise                                       -> ACTIVE
 *
 * `EXPIRING_SOON` is a real `WarrantyStatus` enum member (used for
 * persistence/filtering elsewhere) that this function deliberately never
 * returns: whether a warranty counts as "expiring soon" depends on a
 * threshold (e.g. "within 30 days of expiry") that is a business decision
 * not yet confirmed (PRD §0.6 open item). Inventing a number here would bake
 * an unconfirmed business rule into a "pure calculation" function that looks
 * authoritative. Revisit once the threshold is confirmed.
 */
export function calculateWarrantyStatus(input: CalculateWarrantyStatusInput): WarrantyStatusResult {
  const { warrantyMonths, startDate, voidedAt } = input;
  const now = input.now ?? new Date();

  if (voidedAt) {
    return "VOID";
  }

  if (warrantyMonths === null || warrantyMonths === undefined || !startDate) {
    return "NOT_COVERED";
  }

  const expiryDate = new Date(startDate);
  expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);

  if (now.getTime() > expiryDate.getTime()) {
    return "EXPIRED";
  }

  return "ACTIVE";
}
