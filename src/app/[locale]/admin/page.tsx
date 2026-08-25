"use client";

import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Extract locale from pathname (e.g., /en/admin -> en)
  const locale = pathname.split("/")[1] || "en";

  useEffect(() => {
    if (status === "unauthenticated") {
      // Preserve locale in redirect
      router.push(`/${locale}/auth/signin`);
    } else if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      // Preserve locale when redirecting non-admin users
      router.push(`/${locale}`);
    }
  }, [status, session?.user?.role, router, locale]);

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.dashboard")}</h1>
          <button
            onClick={() => signOut({ redirectTo: "/" })}
            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 transition-colors"
          >
            {t("auth.signout")}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="space-y-2">
            <p className="text-zinc-600">
              {t("admin.welcome")}, {session.user.email}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">{t("admin.products")}</h3>
              <p className="text-zinc-600 mb-4">{t("admin.manageProductCatalog")}</p>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {t("admin.goToProducts")}
              </button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">{t("admin.orders")}</h3>
              <p className="text-zinc-600 mb-4">{t("admin.viewManageOrders")}</p>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {t("admin.goToOrders")}
              </button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">{t("admin.analytics")}</h3>
              <p className="text-zinc-600 mb-4">{t("admin.viewSalesMetrics")}</p>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {t("admin.goToAnalytics")}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h3 className="font-semibold text-amber-900 mb-2">{t("admin.comingSoon")}</h3>
            <p className="text-amber-800">{t("admin.fullAdminFunctionality")}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
