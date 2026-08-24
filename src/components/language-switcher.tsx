"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { locales, type Locale } from "@/i18n";
import { setLocalePreference } from "@/lib/set-locale-action";

interface LanguageSwitcherProps {
  currentLocale: string;
}

export function LanguageSwitcher({ currentLocale }: LanguageSwitcherProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const locale = useMemo(() => {
    return (locales.includes(currentLocale as Locale) ? currentLocale : "en") as Locale;
  }, [currentLocale]);

  const localeOptions: { code: Locale; label: string }[] = [
    { code: "en", label: t("nav.en") },
    { code: "so", label: t("nav.so") },
  ];

  const handleLanguageChange = async (newLocale: Locale) => {
    // Remove the current locale prefix from pathname
    const pathWithoutLocale = pathname.replace(`/${locale}`, "");
    const newPath = `/${newLocale}${pathWithoutLocale || ""}`;

    // Set locale preference securely via server action (sets HttpOnly, Secure, SameSite flags)
    await setLocalePreference(newLocale);

    // Navigate to the new locale path
    router.push(newPath);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
        title={t("nav.changeLanguage")}
      >
        <span className="mr-2">{locale.toUpperCase()}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 rounded-lg border border-zinc-200 bg-white shadow-lg z-50">
          {localeOptions.map((opt) => (
            <button
              key={opt.code}
              onClick={() => handleLanguageChange(opt.code)}
              className={`block w-full text-left px-4 py-2 text-sm ${
                locale === opt.code
                  ? "bg-blue-50 text-blue-600 font-medium"
                  : "text-zinc-700 hover:bg-zinc-50"
              } first:rounded-t-lg last:rounded-b-lg transition-colors`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
