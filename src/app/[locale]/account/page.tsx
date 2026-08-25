"use client";

import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Extract locale from pathname (e.g., /en/account -> en)
  const locale = pathname.split("/")[1] || "en";

  useEffect(() => {
    if (status === "unauthenticated") {
      // Preserve locale in redirect
      router.push(`/${locale}/auth/signin`);
    }
  }, [status, router, locale]);

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("account.myAccount")}</h1>
            <p className="text-zinc-600">{t("account.manageSettings")}</p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-4">{t("account.accountInformation")}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-900">
                    {t("account.email")}
                  </label>
                  <p className="mt-1 text-zinc-700">{session.user.email}</p>
                </div>

                {session.user.name && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-900">
                      {t("account.name")}
                    </label>
                    <p className="mt-1 text-zinc-700">{session.user.name}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-900">
                    {t("account.role")}
                  </label>
                  <p className="mt-1 text-zinc-700">
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                      {session.user.role === "ADMIN"
                        ? t("account.administrator")
                        : t("account.customer")}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-900">
                    {t("account.language")}
                  </label>
                  <p className="mt-1 text-zinc-700">
                    {locale === "so" ? t("nav.so") : t("nav.en")}
                  </p>
                </div>
              </div>
            </div>

            {session.user.role === "ADMIN" && (
              <div className="border-t border-zinc-200 pt-6">
                <h3 className="text-lg font-semibold mb-4">{t("account.adminAccess")}</h3>
                <p className="text-zinc-600 mb-4">{t("account.adminPrivileges")}</p>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t("account.goToDashboard")}
                </button>
              </div>
            )}

            <div className="border-t border-zinc-200 pt-6">
              <h3 className="text-lg font-semibold mb-4">{t("account.signOut")}</h3>
              <button
                onClick={() => signOut({ redirectTo: "/" })}
                className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("auth.signout")}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
