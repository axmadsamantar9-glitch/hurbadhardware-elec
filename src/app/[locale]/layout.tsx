import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Providers } from "../providers";
import { LanguageSwitcher } from "@/components/language-switcher";
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

  return (
    <html lang={langMap[locale]} className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers locale={locale}>
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
              <h1 className="text-2xl font-bold">HurbadHardware</h1>
              <LanguageSwitcher currentLocale={locale} />
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
