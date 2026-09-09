import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getWarrantyDetailForUser } from "@/lib/api/warranties";
import { validateCallbackUrl } from "@/lib/validate-callback-url";
import { locales, defaultLocale, type Locale } from "@/i18n";
import type { WarrantyStatusResult } from "@/lib/warranty/status";

export const dynamic = "force-dynamic";

interface WarrantyDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

/**
 * Authenticated warranty-detail page (HUB-42 AC4).
 *
 * `getWarrantyDetailForUser()` scopes ownership IN THE WHERE CLAUSE, so a
 * well-formed warranty id belonging to a different user renders the exact
 * same `notFound()` as a nonexistent id -- never leaks whether the id
 * exists at all (same pattern as src/app/[locale]/account/orders/[id]/page.tsx).
 */
export default async function WarrantyDetailPage({ params }: WarrantyDetailPageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = validateCallbackUrl(`/${locale}/account/warranties/${id}`);
    redirect(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const t = await getTranslations({ locale });
  const warranty = await getWarrantyDetailForUser(session.user.id, id);
  if (!warranty) {
    notFound();
  }

  const dateFormatter = new Intl.DateTimeFormat(locale === "so" ? "so" : "en", {
    dateStyle: "medium",
  });

  const statusLabel = (status: WarrantyStatusResult): string => {
    switch (status) {
      case "ACTIVE":
        return t("warranty.statusActive");
      case "EXPIRING_SOON":
        return t("warranty.statusExpiringSoon");
      case "EXPIRED":
        return t("warranty.statusExpired");
      case "VOID":
        return t("warranty.statusVoid");
      case "NOT_COVERED":
        return t("warranty.statusNotCovered");
      default:
        return status;
    }
  };

  const coverageTerms = locale === "so" ? warranty.coverageTermsSo : warranty.coverageTermsEn;
  const exclusions = locale === "so" ? warranty.exclusionsSo : warranty.exclusionsEn;
  const productName =
    locale === "so" ? warranty.productNameSnapshotSo : warranty.productNameSnapshotEn;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href={`/${locale}/account/warranties`}
            className="text-sm text-blue-600 hover:underline"
          >
            {t("warranty.backToWarranties")}
          </Link>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {t("warranty.warrantyNumber", { warrantyId: warranty.id })}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  warranty.status === "ACTIVE"
                    ? "bg-green-100 text-green-800"
                    : warranty.status === "EXPIRED" || warranty.status === "VOID"
                      ? "bg-red-100 text-red-800"
                      : "bg-zinc-100 text-zinc-800"
                }`}
              >
                {statusLabel(warranty.status)}
              </span>
            </div>

            <p className="text-zinc-900">{productName}</p>

            {warranty.serialNumber && (
              <p className="text-sm text-zinc-600">
                {t("warranty.serialNumber")}: {warranty.serialNumber}
              </p>
            )}

            <p className="text-sm text-zinc-500">
              {t("warranty.registeredOn", { date: dateFormatter.format(warranty.createdAt) })}
            </p>
            {warranty.expiryDate && (
              <p className="text-sm text-zinc-500">
                {t("warranty.expiresOn", { date: dateFormatter.format(warranty.expiryDate) })}
              </p>
            )}

            {coverageTerms && (
              <div>
                <h2 className="font-semibold text-zinc-900">{t("warranty.coverageTerms")}</h2>
                <p className="text-sm text-zinc-600">{coverageTerms}</p>
              </div>
            )}

            {exclusions && (
              <div>
                <h2 className="font-semibold text-zinc-900">{t("warranty.exclusions")}</h2>
                <p className="text-sm text-zinc-600">{exclusions}</p>
              </div>
            )}

            <Link
              href={`/${locale}/account/warranties/${warranty.id}/claim`}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {t("warranty.fileClaim")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
