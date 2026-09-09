import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getWarrantiesForUser } from "@/lib/api/warranties";
import { validateCallbackUrl } from "@/lib/validate-callback-url";
import { locales, defaultLocale, type Locale } from "@/i18n";
import type { WarrantyStatusResult } from "@/lib/warranty/status";

export const dynamic = "force-dynamic";

interface WarrantiesPageProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

/**
 * Authenticated warranty list (HUB-42 AC4). Same server-side `auth()` +
 * redirect pattern as src/app/[locale]/account/orders/page.tsx.
 */
export default async function WarrantiesPage({ params }: WarrantiesPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = validateCallbackUrl(`/${locale}/account/warranties`);
    redirect(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const t = await getTranslations({ locale });
  const warranties = await getWarrantiesForUser(session.user.id);

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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("warranty.title")}</h1>
          </div>

          {warranties.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
              <p className="text-zinc-600">{t("warranty.empty")}</p>
              <Link
                href={`/${locale}`}
                className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t("warranty.browseProducts")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {warranties.map((warranty) => (
                <li
                  key={warranty.id}
                  className="rounded-lg border border-zinc-200 bg-white p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-zinc-900">
                        {t("warranty.warrantyNumber", { warrantyId: warranty.id })}
                      </span>
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
                    <p className="text-sm text-zinc-900">{warranty.productNameSnapshotEn}</p>
                    <p className="text-sm text-zinc-500">
                      {t("warranty.registeredOn", {
                        date: dateFormatter.format(warranty.createdAt),
                      })}
                    </p>
                    {warranty.expiryDate && (
                      <p className="text-sm text-zinc-500">
                        {t("warranty.expiresOn", {
                          date: dateFormatter.format(warranty.expiryDate),
                        })}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/${locale}/account/warranties/${warranty.id}`}
                    className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
                  >
                    {t("warranty.viewDetails")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
