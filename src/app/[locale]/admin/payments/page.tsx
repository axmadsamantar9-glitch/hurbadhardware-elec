"use client";

/**
 * /admin/payments -- read-only payment review list (U23, AC10).
 * Same RBAC pattern as src/app/[locale]/admin/page.tsx: client-side session
 * check, redirect non-admins; the API route additionally enforces the same
 * check server-side (never rely on the client check alone).
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

interface PaymentReviewRow {
  id: string;
  orderId: string;
  gateway: string;
  method: string;
  status: string;
  chargeAmount: number;
  chargeCurrency: string;
  createdAt: string;
  pollAttempts: number;
  lastPolledAt: string | null;
  orderStatus: string;
  orderTotalUsd: number;
}

export const dynamic = "force-dynamic";

export default function AdminPaymentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const locale = pathname.split("/")[1] || "en";

  const [rows, setRows] = useState<PaymentReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/${locale}/auth/signin`);
    } else if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.push(`/${locale}`);
    }
  }, [status, session?.user?.role, router, locale]);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.role !== "ADMIN") return;
    let cancelled = false;
    fetch("/api/admin/payments")
      .then((res) => res.json())
      .then((data: { rows?: PaymentReviewRow[] }) => {
        if (!cancelled) setRows(data.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load payments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.role]);

  if (status === "loading" || !session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Payments Requiring Review</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4">Order</th>
              <th className="py-2 pr-4">Gateway</th>
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Charge</th>
              <th className="py-2 pr-4">Poll Attempts</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2 pr-4">{row.orderId}</td>
                <td className="py-2 pr-4">{row.gateway}</td>
                <td className="py-2 pr-4">{row.method}</td>
                <td className="py-2 pr-4">{row.status}</td>
                <td className="py-2 pr-4">
                  {row.chargeAmount} {row.chargeCurrency}
                </td>
                <td className="py-2 pr-4">{row.pollAttempts}</td>
                <td className="py-2 pr-4">{new Date(row.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-zinc-500">
                  No payments currently need review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
