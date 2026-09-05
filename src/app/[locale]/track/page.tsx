"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { OrderStatusTimeline } from "@/components/account/order-status-timeline";
import { buildOrderTimeline } from "@/lib/order-timeline";
import { localeField } from "@/lib/locale-field";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface TrackResult {
  id: string;
  status: OrderStatus;
  trackingNumber: string | null;
  items: Array<{ nameSnapshotEn: string; nameSnapshotSo: string; quantity: number }>;
  statusHistory: Array<{ status: OrderStatus; createdAt: string }>;
  totals: { subtotalUsd: number; discountUsd: number; taxUsd: number; totalUsd: number };
}

/**
 * Public order-tracking page (HUB-39, U14 / PRD R14, AC5). No auth required
 * -- POSTs to /api/track, which is the sole trust boundary (dual rate limit,
 * generic 404, reduced response shape; see src/app/api/track/route.ts).
 * Client Component because it's an interactive form with no server data
 * dependency of its own; `useTranslations()` works here because messages are
 * forwarded to `NextIntlClientProvider` (see src/app/[locale]/layout.tsx).
 */
export default function TrackOrderPage() {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const nameField = localeField(locale, "nameSnapshot");

  const [orderIdSuffix, setOrderIdSuffix] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  const statusLabels: Record<OrderStatus, string> = {
    PLACED: t("tracking.statusPlaced"),
    PROCESSING: t("tracking.statusProcessing"),
    SHIPPED: t("tracking.statusShipped"),
    DELIVERED: t("tracking.statusDelivered"),
    CANCELLED: t("tracking.statusCancelled"),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIdSuffix, email }),
      });

      if (res.status === 404) {
        setError(t("tracking.notFound"));
        return;
      }
      if (res.status === 429) {
        setError(t("tracking.rateLimited"));
        return;
      }
      if (!res.ok) {
        setError(t("tracking.errorGeneric"));
        return;
      }

      const data = (await res.json()) as TrackResult;
      setResult(data);
    } catch {
      setError(t("tracking.errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const stages = result
    ? buildOrderTimeline(
        result.statusHistory.map((h) => ({ status: h.status, createdAt: new Date(h.createdAt) }))
      )
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("tracking.title")}</h1>
            <p className="text-zinc-600">{t("tracking.description")}</p>
          </div>

          {!result && (
            <form
              onSubmit={handleSubmit}
              className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4"
            >
              <div>
                <label htmlFor="orderIdSuffix" className="block text-sm font-medium text-zinc-900">
                  {t("tracking.orderIdSuffix")}
                </label>
                <input
                  id="orderIdSuffix"
                  type="text"
                  required
                  maxLength={64}
                  value={orderIdSuffix}
                  onChange={(e) => setOrderIdSuffix(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-900">
                  {t("tracking.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? t("tracking.submitting") : t("tracking.submit")}
              </button>
            </form>
          )}

          {result && (
            <div className="space-y-6">
              <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold">
                  {t("tracking.orderNumber", { orderId: result.id })}
                </h2>
                <OrderStatusTimeline stages={stages} labels={statusLabels} locale={locale} />
                {result.trackingNumber && (
                  <p className="text-sm text-zinc-700">
                    <span className="font-medium">{t("tracking.trackingNumber")}:</span>{" "}
                    {result.trackingNumber}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold">{t("tracking.items")}</h2>
                <ul className="divide-y divide-zinc-200">
                  {result.items.map((item, i) => (
                    <li key={i} className="flex items-center justify-between py-3">
                      <span className="text-zinc-900">{item[nameField]}</span>
                      <span className="text-sm text-zinc-500">
                        {t("tracking.quantity")}: {item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-zinc-200 pt-4 flex justify-between text-base font-semibold text-zinc-900">
                  <span>{t("tracking.total")}</span>
                  <span>${result.totals.totalUsd.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setOrderIdSuffix("");
                  setEmail("");
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                {t("tracking.searchAgain")}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
