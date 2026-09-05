import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Providers } from "../providers";
import { LanguageSwitcher } from "@/components/language-switcher";
import { CategoryNav } from "@/components/storefront/category-nav";
import { CartBadge } from "@/components/storefront/cart-badge";
import { CartMergeListener } from "@/components/storefront/cart-merge-listener";
import { getCategories } from "@/lib/api/categories";
import { getTranslations, getMessages } from "next-intl/server";
import "../globals.css";
import { locales, defaultLocale, type Locale } from "@/i18n";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HurbadHardware",
    template: "%s | HurbadHardware",
  },
  description:
    "Electronics retailer for East Africa — smartphones, laptops, networking, CCTV and more.",
};

// For now, mark as dynamic to avoid prerendering issues with next-intl context
export const dynamic = "force-dynamic";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = (locales.includes(rawLocale as Locale) ? rawLocale : defaultLocale) as Locale;

  // Map locale to HTML lang attribute
  const langMap: Record<Locale, string> = {
    en: "en",
    so: "so",
  };

  // Category nav is sitewide (U8) — fetched once here rather than per-page.
  const categories = await getCategories();
  const t = await getTranslations({ locale });
  // Server components (t/getTranslations above) resolve messages directly
  // from src/i18n.ts's request config -- but "use client" components (cart,
  // auth forms, add-to-cart buttons, ...) only see whatever
  // NextIntlClientProvider is explicitly given. Without this, every
  // useTranslations() call in a client component silently fails and renders
  // the raw dotted key instead of text.
  const messages = await getMessages({ locale });

  return (
    <html lang={langMap[locale]} className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers locale={locale} messages={messages}>
          <CartMergeListener />
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center gap-4">
              <Link href={`/${locale}`} className="text-2xl font-bold">
                HurbadHardware
              </Link>
              <div className="flex items-center gap-2">
                <CartBadge locale={locale} label={t("cart.title")} />
                <LanguageSwitcher currentLocale={locale} />
              </div>
            </div>
          </header>
          <CategoryNav categories={categories} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
