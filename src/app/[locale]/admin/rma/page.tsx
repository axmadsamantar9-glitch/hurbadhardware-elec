"use client";

/**
 * /admin/rma -- RMA search + manual creation (HUB-43 AC3/AC6). Same RBAC
 * pattern as src/app/[locale]/admin/warranties/page.tsx: client-side session
 * check, redirect non-admins; the API routes additionally enforce the same
 * check server-side (never rely on the client check alone).
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface RmaSearchRow {
  id: string;
  status: string;
  claimId: string;
  createdAt: string;
  claim: {
    id: string;
    warranty: {
      orderId: string;
      user: { email: string | null } | null;
    };
  };
}

export const dynamic = "force-dynamic";

export default function AdminRmaPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const locale = pathname.split("/")[1] || "en";

  const [claimId, setClaimId] = useState("");
  const [orderId, setOrderId] = useState("");

  const [rows, setRows] = useState<RmaSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createClaimId, setCreateClaimId] = useState("");
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/auth/signin`);
    } else if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.push(`/${locale}`);
    }
  }, [status, session?.user?.role, router, locale]);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (claimId) qs.set("claimId", claimId);
      if (orderId) qs.set("orderId", orderId);

      const res = await fetch(`/api/admin/rma?${qs.toString()}`);
      if (!res.ok) throw new Error("search_failed");
      const data = (await res.json()) as { rows: RmaSearchRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError("Failed to search RMAs");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateMessage(null);
    try {
      const res = await fetch("/api/admin/rma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: createClaimId }),
      });
      if (!res.ok) {
        setCreateMessage("Creation failed");
        return;
      }
      setCreateMessage(t("admin.warranty.rmaCreateSuccess"));
      setCreateClaimId("");
      void runSearch();
    } catch {
      setCreateMessage("Creation failed");
    }
  }

  if (status === "loading" || !session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-6">{t("admin.warranty.rmaTitle")}</h1>
        <form onSubmit={runSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
          <input
            type="text"
            placeholder={t("admin.warranty.rmaSearchPlaceholderClaimId")}
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("admin.warranty.rmaSearchPlaceholderOrderId")}
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="sm:col-span-3 inline-flex w-fit items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {t("admin.warranty.searchButton")}
          </button>
        </form>

        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">RMA</th>
                <th className="py-2 pr-4">Claim</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/${locale}/admin/rma/${row.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{row.claim.id}</td>
                  <td className="py-2 pr-4">{row.claim.warranty.orderId}</td>
                  <td className="py-2 pr-4">{row.claim.warranty.user?.email ?? "—"}</td>
                  <td className="py-2 pr-4">{row.status}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    {t("admin.warranty.rmaNoResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-zinc-200 pt-8">
        <h2 className="text-lg font-semibold mb-4">{t("admin.warranty.rmaCreateTitle")}</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              {t("admin.warranty.rmaCreateClaimId")}
            </label>
            <input
              type="text"
              required
              value={createClaimId}
              onChange={(e) => setCreateClaimId(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {t("admin.warranty.rmaCreateButton")}
          </button>
        </form>
        {createMessage && <p className="mt-2 text-sm text-zinc-700">{createMessage}</p>}
      </div>
    </div>
  );
}
