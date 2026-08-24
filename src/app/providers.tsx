"use client";

import { NextIntlClientProvider } from "next-intl";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children, locale }: { children: ReactNode; locale: string }) {
  return (
    <NextIntlClientProvider locale={locale}>
      <SessionProvider>{children}</SessionProvider>
    </NextIntlClientProvider>
  );
}
