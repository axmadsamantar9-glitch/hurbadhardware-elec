"use client";

/**
 * /admin/warranties -- warranty search + manual registration (HUB-42 AC3/AC5).
 * Same RBAC pattern as src/app/[locale]/admin/payments/page.tsx: client-side
 * session check, redirect non-admins; the API routes additionally enforce the
 * same check server-side (never rely on the client check alone).
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

interface WarrantySearchRow {
  id: string;
  orderId: string;
  orderItemId: string;
  productNameSnapshotEn: string;
  skuSnapshot: string | null;
  status: string;
  userEmail: string | null;
  createdAt: string;
}

export const dynamic = "force-dynamic";

export default function AdminWarrantiesPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const locale = pathname.split("/")[1] || "en";

  const [customerEmail, setCustomerEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [sku, setSku] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [warrantyId, setWarrantyId] = useState("");

  const [rows, setRows] = useState<WarrantySearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [registerOrderItemId, setRegisterOrderItemId] = useState("");
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);

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
      if (customerEmail) qs.set("customerEmail", customerEmail);
      if (orderId) qs.set("orderId", orderId);
      if (sku) qs.set("sku", sku);
      if (serialNumber) qs.set("serialNumber", serialNumber);
      if (warrantyId) qs.set("warrantyId", warrantyId);

      const res = await fetch(`/api/admin/warranties?${qs.toString()}`);
      if (!res.ok) throw new Error("search_failed");
      const data = (await res.json()) as { rows: WarrantySearchRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError("Failed to search warranties");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterMessage(null);
    try {
      const res = await fetch("/api/admin/warranties/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: registerOrderItemId }),
      });
      if (!res.ok) {
        setRegisterMessage("Registration failed");
        return;
      }
      setRegisterMessage(t("admin.warranty.registerSuccess"));
      setRegisterOrderItemId("");
      void runSearch();
    } catch {
      setRegisterMessage("Registration failed");
    }
  }

  if (status === "loading" || !session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-6">{t("admin.warranty.title")}</h1>
        <form onSubmit={runSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-5 mb-6">
          <input
            type="text"
            placeholder={t("admin.warranty.searchPlaceholderEmail")}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("admin.warranty.searchPlaceholderOrderId")}
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("admin.warranty.searchPlaceholderSku")}
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("admin.warranty.searchPlaceholderSerial")}
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder={t("admin.warranty.searchPlaceholderWarrantyId")}
            value={warrantyId}
            onChange={(e) => setWarrantyId(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="sm:col-span-5 inline-flex w-fit items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
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
                <th className="py-2 pr-4">Warranty</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4">{row.id}</td>
                  <td className="py-2 pr-4">{row.orderId}</td>
                  <td className="py-2 pr-4">{row.productNameSnapshotEn}</td>
                  <td className="py-2 pr-4">{row.skuSnapshot ?? "—"}</td>
                  <td className="py-2 pr-4">{row.userEmail ?? "—"}</td>
                  <td className="py-2 pr-4">{row.status}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-zinc-500">
                    {t("admin.warranty.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-zinc-200 pt-8">
        <h2 className="text-lg font-semibold mb-4">{t("admin.warranty.registerTitle")}</h2>
        <form onSubmit={handleRegister} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-900">
              {t("admin.warranty.registerOrderItemId")}
            </label>
            <input
              type="text"
              required
              value={registerOrderItemId}
              onChange={(e) => setRegisterOrderItemId(e.target.value)}
              className="mt-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {t("admin.warranty.registerButton")}
          </button>
        </form>
        {registerMessage && <p className="mt-2 text-sm text-zinc-700">{registerMessage}</p>}
      </div>
    </div>
  );
}
