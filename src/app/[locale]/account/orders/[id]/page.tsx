import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getOrderDetailForUser } from "@/lib/api/orders";
import { buildOrderTimeline } from "@/lib/order-timeline";
import { OrderStatusTimeline } from "@/components/account/order-status-timeline";
import { validateCallbackUrl } from "@/lib/validate-callback-url";
import { localeField } from "@/lib/locale-field";
import { locales, defaultLocale, type Locale } from "@/i18n";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

function resolveLocale(rawLocale: string): Locale {
  return (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;
}

/**
 * Authenticated order-detail page (HUB-39, U14 / PRD R14, AC2/AC3/AC4).
 *
 * `getOrderDetailForUser()` scopes ownership IN THE WHERE CLAUSE (see
 * src/lib/api/orders.ts) so a well-formed order id belonging to a different
 * user renders the exact same `notFound()` as a nonexistent id -- never
 * leaks whether the id exists at all.
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);

  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = validateCallbackUrl(`/${locale}/account/orders/${id}`);
    redirect(`/${locale}/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const t = await getTranslations({ locale });
  const order = await getOrderDetailForUser(session.user.id, id);
  if (!order) {
    notFound();
  }

  const nameField = localeField(locale, "nameSnapshot");
  const stages = buildOrderTimeline(order.statusHistory);

  const statusLabels: Record<OrderStatus, string> = {
    PLACED: t("orders.statusPlaced"),
    PROCESSING: t("orders.statusProcessing"),
    SHIPPED: t("orders.statusShipped"),
    DELIVERED: t("orders.statusDelivered"),
    CANCELLED: t("orders.statusCancelled"),
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <Link
              href={`/${locale}/account/orders`}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; {t("orders.backToOrders")}
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("orders.orderNumber", { orderId: order.id })}
            </h1>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t("orders.statusTimeline")}</h2>
            <OrderStatusTimeline stages={stages} labels={statusLabels} locale={locale} />
            {order.trackingNumber && (
              <p className="text-sm text-zinc-700">
                <span className="font-medium">{t("orders.trackingNumber")}:</span>{" "}
                {order.trackingNumber}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-semibold">{t("orders.items")}</h2>
            <ul className="divide-y divide-zinc-200">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-zinc-900">{item[nameField]}</p>
                    <p className="text-sm text-zinc-500">
                      {t("orders.quantity")}: {item.quantity} &middot; {t("orders.unitPrice")}: $
                      {item.unitPriceUsd.toFixed(2)}
                    </p>
                  </div>
                  <span className="font-medium text-zinc-900">
                    ${(item.unitPriceUsd * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t border-zinc-200 pt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600">{t("orders.subtotal")}</span>
                <span>${order.totals.subtotalUsd.toFixed(2)}</span>
              </div>
              {order.totals.discountUsd > 0 && (
                <div className="flex justify-between">
                  <span className="text-zinc-600">{t("orders.discount")}</span>
                  <span>-${order.totals.discountUsd.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-600">{t("orders.tax")}</span>
                <span>${order.totals.taxUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-zinc-900">
                <span>{t("orders.total")}</span>
                <span>${order.totals.totalUsd.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {order.shippingAddress && (
            <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-2">
              <h2 className="text-lg font-semibold">{t("orders.shippingAddress")}</h2>
              <p className="text-sm text-zinc-700">
                {order.shippingAddress.fullName}
                <br />
                {order.shippingAddress.addressLine1}
                {order.shippingAddress.addressLine2 && (
                  <>
                    <br />
                    {order.shippingAddress.addressLine2}
                  </>
                )}
                <br />
                {order.shippingAddress.city}
                {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ""}
                <br />
                {order.shippingAddress.country}
                <br />
                {order.shippingAddress.phone}
              </p>
            </div>
          )}

          {order.paymentMethod && (
            <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-2">
              <h2 className="text-lg font-semibold">{t("orders.paymentMethod")}</h2>
              <p className="text-sm text-zinc-700">{order.paymentMethod}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
