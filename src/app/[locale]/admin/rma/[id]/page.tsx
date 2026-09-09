"use client";

/**
 * /admin/rma/[id] -- RMA detail + status advancement (HUB-43 AC6). Same RBAC
 * pattern as src/app/[locale]/admin/warranties/claims/[id]/page.tsx:
 * client-side session check, redirect non-admins; PATCH
 * /api/admin/rma/[id] enforces the same check server-side plus the
 * transition rules. No override concept for RMA (unlike the claim page).
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { nextValidRmaStatuses } from "@/lib/rma/transitions";
import type { RmaStatus, ProductCondition } from "@prisma/client";

interface RmaDetail {
  id: string;
  status: RmaStatus;
  conditionOnReceipt: ProductCondition | null;
  inspectionNotes: string | null;
  claimId: string;
  history: Array<{ id: string; status: RmaStatus; createdAt: string }>;
}

const CONDITIONS: ProductCondition[] = ["NEW", "OPEN_BOX", "REFURBISHED", "USED"];

export const dynamic = "force-dynamic";

export default function AdminRmaDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const locale = pathname.split("/")[1] || "en";
  const rmaId = params.id;

  const [rma, setRma] = useState<RmaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<RmaStatus | "">("");
  const [conditionOnReceipt, setConditionOnReceipt] = useState<ProductCondition | "">("");
  const [inspectionNotes, setInspectionNotes] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/auth/signin`);
    } else if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.push(`/${locale}`);
    }
  }, [status, session?.user?.role, router, locale]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "ADMIN") return;
    fetch(`/api/admin/rma/${rmaId}`)
      .then((res) => res.json())
      .then((data: RmaDetail) => setRma(data))
      .catch(() => setError("Failed to load RMA"))
      .finally(() => setLoading(false));
  }, [status, session?.user?.role, rmaId]);

  async function handleAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!targetStatus) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/rma/${rmaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          ...(conditionOnReceipt ? { conditionOnReceipt } : {}),
          ...(inspectionNotes ? { inspectionNotes } : {}),
        }),
      });
      if (res.status === 400) {
        setError(t("admin.warranty.rmaInvalidTransition"));
        return;
      }
      if (!res.ok) {
        setError("Failed to advance RMA");
        return;
      }
      const updated = (await res.json()) as RmaDetail;
      setRma((prev) =>
        prev
          ? {
              ...prev,
              status: updated.status,
              conditionOnReceipt: updated.conditionOnReceipt,
              inspectionNotes: updated.inspectionNotes,
            }
          : prev
      );
      setTargetStatus("");
      setConditionOnReceipt("");
      setInspectionNotes("");
    } catch {
      setError("Failed to advance RMA");
    }
  }

  if (status === "loading" || !session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-12">Loading...</div>;
  if (!rma) return <div className="mx-auto max-w-3xl px-4 py-12">RMA not found.</div>;

  const nextStatuses = nextValidRmaStatuses(rma.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("admin.warranty.rmaDetailTitle")}</h1>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-2">
        <p>
          <span className="font-medium">{t("admin.warranty.rmaStatus")}:</span> {rma.status}
        </p>
        <p className="text-sm text-zinc-600">Claim: {rma.claimId}</p>
        {rma.conditionOnReceipt && (
          <p className="text-sm text-zinc-600">
            {t("admin.warranty.rmaConditionOnReceiptLabel")}: {rma.conditionOnReceipt}
          </p>
        )}
        {rma.inspectionNotes && (
          <p className="text-sm text-zinc-600">
            {t("admin.warranty.rmaInspectionNotesLabel")}: {rma.inspectionNotes}
          </p>
        )}
      </div>

      {rma.history.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="font-semibold text-zinc-900 mb-2">History</h2>
          <ul className="space-y-1 text-sm text-zinc-600">
            {rma.history.map((h) => (
              <li key={h.id}>
                {h.status} — {new Date(h.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextStatuses.length > 0 && (
        <form
          onSubmit={handleAdvance}
          className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              {t("admin.warranty.rmaAdvanceTo")}
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as RmaStatus)}
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
              {t("admin.warranty.rmaConditionOnReceiptLabel")}
            </label>
            <select
              value={conditionOnReceipt}
              onChange={(e) => setConditionOnReceipt(e.target.value as ProductCondition)}
              className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">--</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              {t("admin.warranty.rmaInspectionNotesLabel")}
            </label>
            <input
              type="text"
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!targetStatus}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {t("admin.warranty.rmaAdvanceButton")}
          </button>
        </form>
      )}
    </div>
  );
}
