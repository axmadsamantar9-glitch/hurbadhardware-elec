import { Suspense } from 'react'
import { SignInForm } from './signin-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
}

function SignInSkeleton() {
  return (
    <div className="w-full max-w-md space-y-8 animate-pulse">
      <div className="space-y-2 text-center">
        <div className="h-10 bg-zinc-200 rounded w-24 mx-auto"></div>
        <div className="h-4 bg-zinc-200 rounded w-48 mx-auto"></div>
      </div>
      <div className="space-y-4">
        <div className="h-10 bg-zinc-200 rounded"></div>
        <div className="h-10 bg-zinc-200 rounded"></div>
        <div className="h-10 bg-zinc-200 rounded"></div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Suspense fallback={<SignInSkeleton />}>
        <SignInForm />
      </Suspense>
    </div>
  )
}
