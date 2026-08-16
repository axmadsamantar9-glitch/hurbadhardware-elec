import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'HurbadHardware',
    template: '%s | HurbadHardware',
  },
  description:
    'Electronics retailer for East Africa — smartphones, laptops, networking, CCTV and more.',
}

// U4 replaces this with a locale-aware shell at src/app/[locale]/layout.tsx,
// which sets lang from the active locale rather than hardcoding English.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
