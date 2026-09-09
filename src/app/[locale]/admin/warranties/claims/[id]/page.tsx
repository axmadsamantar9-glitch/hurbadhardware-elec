"use client";

/**
 * /admin/warranties/claims/[id] -- claim detail + status advancement
 * (HUB-42 AC6/AC7). Same RBAC pattern as
 * src/app/[locale]/admin/payments/page.tsx: client-side session check,
 * redirect non-admins; PATCH /api/admin/warranties/claims/[id] enforces the
 * same check server-side plus the transition/override rules.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { nextValidClaimStatuses } from "@/lib/warranty/claim-transitions";
import type { WarrantyClaimStatus } from "@prisma/client";

interface ClaimDetail {
  id: string;
  status: WarrantyClaimStatus;
  claimReason: string;
  customerDescription: string | null;
  isOverride: boolean;
  warranty: {
    id: string;
    status: string;
  };
}

export const dynamic = "force-dynamic";

export default function AdminWarrantyClaimPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const locale = pathname.split("/")[1] || "en";
  const claimId = params.id;

  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<WarrantyClaimStatus | "">("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/auth/signin`);
    } else if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.push(`/${locale}`);
    }
  }, [status, session?.user?.role, router, locale]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "ADMIN") return;
    fetch(`/api/admin/warranties/claims/${claimId}`)
      .then((res) => res.json())
      .then((data: ClaimDetail) => setClaim(data))
      .catch(() => setError("Failed to load claim"))
      .finally(() => setLoading(false));
  }, [status, session?.user?.role, claimId]);

  async function handleAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!targetStatus) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/warranties/claims/${claimId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          ...(overrideReason ? { overrideReason } : {}),
        }),
      });
      if (res.status === 400) {
        const data = (await res.json()) as { error?: { code?: string } };
        setError(
          data.error?.code === "override_reason_required"
            ? t("admin.warranty.overrideRequired")
            : t("admin.warranty.invalidTransition")
        );
        return;
      }
      if (!res.ok) {
        setError("Failed to advance claim");
        return;
      }
      const updated = (await res.json()) as ClaimDetail;
      setClaim((prev) =>
        prev ? { ...prev, status: updated.status, isOverride: updated.isOverride } : prev
      );
      setTargetStatus("");
      setOverrideReason("");
    } catch {
      setError("Failed to advance claim");
    }
  }

  if (status === "loading" || !session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12">Loading...</div>;
  if (!claim) return <div className="mx-auto max-w-3xl px-4 py-12">Claim not found.</div>;

  const nextStatuses = nextValidClaimStatuses(claim.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("admin.warranty.claimDetailTitle")}</h1>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-2">
        <p>
          <span className="font-medium">{t("admin.warranty.claimStatus")}:</span> {claim.status}
        </p>
        <p className="text-sm text-zinc-600">
          Warranty: {claim.warranty.id} ({claim.warranty.status})
        </p>
        <p className="text-sm text-zinc-600">Reason: {claim.claimReason}</p>
        {claim.customerDescription && (
          <p className="text-sm text-zinc-600">{claim.customerDescription}</p>
        )}
        {claim.isOverride && <p className="text-sm font-medium text-amber-700">Override applied</p>}
      </div>

      {nextStatuses.length > 0 && (
        <form
          onSubmit={handleAdvance}
          className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              {t("admin.warranty.claimAdvanceTo")}
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as WarrantyClaimStatus)}
              className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">--</option>
              {nextStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              {t("admin.warranty.overrideReasonLabel")}
            </label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!targetStatus}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {t("admin.warranty.claimAdvanceButton")}
          </button>
        </form>
      )}
    </div>
  );
}
