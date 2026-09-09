"use client";

import { useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export const dynamic = "force-dynamic";

/**
 * Warranty claim submission form (HUB-42 AC6). Client Component POSTing to
 * POST /api/warranties/[id]/claims, which is the sole trust boundary
 * (ownership re-checked server-side there). Follows the same client-form
 * pattern as src/app/[locale]/track/page.tsx.
 */
export default function WarrantyClaimPage() {
  const t = useTranslations();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "en";
  const warrantyId = params.id;

  const [claimReason, setClaimReason] = useState("");
  const [customerDescription, setCustomerDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/warranties/${warrantyId}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimReason, customerDescription }),
      });

      if (res.status === 404) {
        setError(t("warranty.notFound"));
        return;
      }
      if (!res.ok) {
        setError(t("tracking.errorGeneric"));
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("tracking.errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50">
        <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-zinc-200 bg-white p-8 text-center">
            <p className="text-zinc-900">{t("warranty.claim.submitted")}</p>
            <button
              type="button"
              onClick={() => router.push(`/${locale}/account/warranties/${warrantyId}`)}
              className="text-sm text-blue-600 hover:underline"
            >
              {t("warranty.backToWarranties")}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl space-y-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("warranty.claim.title")}</h1>

          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4"
          >
            <div>
              <label htmlFor="claimReason" className="block text-sm font-medium text-zinc-900">
                {t("warranty.claim.reasonLabel")}
              </label>
              <input
                id="claimReason"
                type="text"
                required
                maxLength={200}
                value={claimReason}
                onChange={(e) => setClaimReason(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
              />
            </div>
            <div>
              <label
                htmlFor="customerDescription"
                className="block text-sm font-medium text-zinc-900"
              >
                {t("warranty.claim.descriptionLabel")}
              </label>
              <textarea
                id="customerDescription"
                maxLength={2000}
                value={customerDescription}
                onChange={(e) => setCustomerDescription(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                rows={5}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {t("warranty.claim.submit")}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
