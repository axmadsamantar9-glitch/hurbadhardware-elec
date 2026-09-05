import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getOrdersForUser } from "@/lib/api/orders";
import { validateCallbackUrl } from "@/lib/validate-callback-url";
import { locales, defaultLocale, type Locale } from "@/i18n";

export const dynamic = "force-dynamic";

interface OrdersPageProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

/**
 * Authenticated order-history list (HUB-39, U14 / PRD R14, AC1).
 *
 * Server Component using the server-side `auth()` helper (not
 * `useSession()`), matching src/app/[locale]/products/[slug]/page.tsx's
 * pattern -- an unauthenticated visitor is redirected to sign-in with the
 * current path preserved as `callbackUrl` (validated to prevent open
 * redirects). The proxy middleware already gates `/account/*` the same way;
 * this is defense-in-depth per the architect's design.
 */
export default async function OrdersPage({ params }: OrdersPageProps) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = validateCallbackUrl(`/${locale}/account/orders`);
    redirect(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const t = await getTranslations({ locale });
  const orders = await getOrdersForUser(session.user.id);

  const dateFormatter = new Intl.DateTimeFormat(locale === "so" ? "so" : "en", {
    dateStyle: "medium",
  });

  const statusLabel = (status: string): string => {
    switch (status) {
      case "PLACED":
        return t("orders.statusPlaced");
      case "PROCESSING":
        return t("orders.statusProcessing");
      case "SHIPPED":
        return t("orders.statusShipped");
      case "DELIVERED":
        return t("orders.statusDelivered");
      case "CANCELLED":
        return t("orders.statusCancelled");
      default:
        return status;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("orders.title")}</h1>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center">
              <p className="text-zinc-600">{t("orders.empty")}</p>
              <Link
                href={`/${locale}`}
                className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t("orders.browseProducts")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="rounded-lg border border-zinc-200 bg-white p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-zinc-900">
                        {t("orders.orderNumber", { orderId: order.id })}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          order.status === "CANCELLED"
                            ? "bg-red-100 text-red-800"
                            : order.status === "DELIVERED"
                              ? "bg-green-100 text-green-800"
                              : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500">
                      {t("orders.placedOn", { date: dateFormatter.format(order.createdAt) })}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {t("orders.itemCount", { count: order.itemCount })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-zinc-900">
                      {t("orders.total")}: ${order.totalUsd.toFixed(2)}
                    </span>
                    <Link
                      href={`/${locale}/account/orders/${order.id}`}
                      className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
                    >
                      {t("orders.viewDetails")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
