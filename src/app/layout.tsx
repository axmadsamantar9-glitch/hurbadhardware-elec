import type { ReactNode } from 'react'

// Root layout now only contains the structure; locale-specific layout
// is at src/app/[locale]/layout.tsx which handles metadata and lang attribute.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
