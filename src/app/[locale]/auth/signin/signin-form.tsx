'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { validateCallbackUrl } from '@/lib/validate-callback-url'

export function SignInForm() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = validateCallbackUrl(searchParams.get('callbackUrl'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      try {
        const result = await signIn('credentials', {
          email,
          password,
          action: 'signin',
          redirect: false,
        })

        if (result?.error) {
          if (result.error.includes('Invalid email or password')) {
            setError(t('auth.invalidCredentials'))
          } else if (result.error.includes('Email already')) {
            setError(t('auth.emailExists'))
          } else {
            setError(result.error || 'An error occurred')
          }
        } else if (result?.ok) {
          router.push(callbackUrl)
          router.refresh()
        }
      } catch {
        setError('An unexpected error occurred')
      }
    })
  }

  const handleGoogleSignIn = async () => {
    startTransition(async () => {
      await signIn('google', { callbackUrl })
    })
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('auth.signin')}</h1>
        <p className="text-zinc-600">{t('auth.signInWithEmail')}</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSignIn} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-900">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPending}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed"
            placeholder="name@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-900">
            {t('auth.password')}
          </label>
          <input
            id="password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isPending}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 placeholder-zinc-400 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? t('auth.signingIn') : t('auth.signin')}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-300"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-zinc-50 px-2 text-zinc-600">Or continue with</span>
        </div>
      </div>

      <button
        onClick={handleGoogleSignIn}
        disabled={isPending}
        className="w-full rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed transition-colors"
      >
        Sign in with Google
      </button>

      <p className="text-center text-sm text-zinc-600">
        {t('auth.noAccount')}{' '}
        <Link href="./register" className="font-medium text-blue-600 hover:text-blue-700">
          {t('auth.register')}
        </Link>
      </p>
    </div>
  )
}
