/**
 * Warranty data layer (HUB-42 AC4 / AC5).
 *
 * Two ownership-scoped customer reads (scoped IN THE WHERE CLAUSE, never a
 * post-fetch `if` check, matching src/lib/api/orders.ts's convention) plus
 * one unscoped admin search. Display status is always recomputed live via
 * `calculateWarrantyStatus()` from the stored snapshot fields rather than
 * trusting the persisted `status` column, since a warranty can silently
 * cross from ACTIVE to EXPIRED purely by the passage of time with no write
 * ever happening.
 */

import { db } from "@/lib/db";
import type { Prisma, Warranty, WarrantyClaimStatus } from "@prisma/client";
import { calculateWarrantyStatus, type WarrantyStatusResult } from "@/lib/warranty/status";

export interface WarrantyListItem {
  id: string;
  orderId: string;
  orderItemId: string;
  productNameSnapshotEn: string;
  productNameSnapshotSo: string;
  skuSnapshot: string | null;
  status: WarrantyStatusResult;
  startDate: Date | null;
  expiryDate: Date | null;
  createdAt: Date;
}

export interface WarrantyDetailView extends WarrantyListItem {
  serialNumber: string | null;
  warrantyMonthsSnapshot: number | null;
  coverageTermsEn: string | null;
  coverageTermsSo: string | null;
  exclusionsEn: string | null;
  exclusionsSo: string | null;
  coverageNotesEn: string | null;
  coverageNotesSo: string | null;
  voidedAt: Date | null;
  registrationSource: string;
  claims: Array<{
    id: string;
    status: WarrantyClaimStatus;
    claimReason: string;
    createdAt: Date;
  }>;
}

function toListItem(w: Warranty): WarrantyListItem {
  return {
    id: w.id,
    orderId: w.orderId,
    orderItemId: w.orderItemId,
    productNameSnapshotEn: w.productNameSnapshotEn,
    productNameSnapshotSo: w.productNameSnapshotSo,
    skuSnapshot: w.skuSnapshot,
    status: calculateWarrantyStatus({
      warrantyMonths: w.warrantyMonthsSnapshot,
      startDate: w.startDate,
      voidedAt: w.voidedAt,
    }),
    startDate: w.startDate,
    expiryDate: w.expiryDate,
    createdAt: w.createdAt,
  };
}

/** List the calling user's own warranties, newest first (AC4). */
export async function getWarrantiesForUser(userId: string): Promise<WarrantyListItem[]> {
  const warranties = await db.warranty.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return warranties.map(toListItem);
}

/**
 * Fetch a single warranty's detail, scoped to `userId` IN THE WHERE CLAUSE --
 * a warranty that exists but belongs to someone else returns `null`,
 * identically to a nonexistent id (same IDOR-safety pattern as
 * getOrderDetailForUser in src/lib/api/orders.ts).
 */
export async function getWarrantyDetailForUser(
  userId: string,
  warrantyId: string
): Promise<WarrantyDetailView | null> {
  const warranty = await db.warranty.findFirst({
    where: { id: warrantyId, userId },
    include: { claims: { orderBy: { createdAt: "desc" } } },
  });
  if (!warranty) return null;

  return {
    ...toListItem(warranty),
    serialNumber: warranty.serialNumber,
    warrantyMonthsSnapshot: warranty.warrantyMonthsSnapshot,
    coverageTermsEn: warranty.coverageTermsEn,
    coverageTermsSo: warranty.coverageTermsSo,
    exclusionsEn: warranty.exclusionsEn,
    exclusionsSo: warranty.exclusionsSo,
    coverageNotesEn: warranty.coverageNotesEn,
    coverageNotesSo: warranty.coverageNotesSo,
    voidedAt: warranty.voidedAt,
    registrationSource: warranty.registrationSource,
    claims: warranty.claims.map((c) => ({
      id: c.id,
      status: c.status,
      claimReason: c.claimReason,
      createdAt: c.createdAt,
    })),
  };
}

export interface SearchWarrantiesFilters {
  customerEmail?: string;
  customerId?: string;
  orderId?: string;
  sku?: string;
  serialNumber?: string;
  warrantyId?: string;
  status?: WarrantyStatusResult;
  page?: number;
  pageSize?: number;
}

export interface WarrantySearchRow extends WarrantyListItem {
  userId: string | null;
  userEmail: string | null;
}

export interface SearchWarrantiesResult {
  rows: WarrantySearchRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Admin, unscoped search (AC5). `status` filters against the *persisted*
 * status column (needed for a SQL `WHERE`) -- since EXPIRING_SOON is never
 * written (see calculateWarrantyStatus's doc comment), filtering by it
 * always returns zero rows, which is correct given no threshold exists yet
 * rather than a bug.
 */
export async function searchWarranties(
  filters: SearchWarrantiesFilters
): Promise<SearchWarrantiesResult> {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 25;

  const where: Prisma.WarrantyWhereInput = {
    ...(filters.warrantyId ? { id: filters.warrantyId } : {}),
    ...(filters.orderId ? { orderId: filters.orderId } : {}),
    ...(filters.sku ? { skuSnapshot: { contains: filters.sku, mode: "insensitive" } } : {}),
    ...(filters.serialNumber
      ? { serialNumber: { contains: filters.serialNumber, mode: "insensitive" } }
      : {}),
    ...(filters.customerId ? { userId: filters.customerId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerEmail
      ? { user: { email: { contains: filters.customerEmail, mode: "insensitive" } } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.warranty.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { email: true } } },
    }),
    db.warranty.count({ where }),
  ]);

  return {
    rows: rows.map((w) => ({
      ...toListItem(w),
      userId: w.userId,
      userEmail: w.user?.email ?? null,
    })),
    total,
    page,
    pageSize,
  };
}
