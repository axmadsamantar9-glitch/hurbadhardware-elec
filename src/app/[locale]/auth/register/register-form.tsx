'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { signIn } from 'next-auth/react'
import Link from 'next/link'

export function RegisterForm() {
  const t = useTranslations()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isPending, startTransition] = useTransition()

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain a number'
    if (!/[!@#$%^&*()_+\-=[\]{};':"\|,.<>?]/.test(pwd)) {
      return 'Password must contain a special character'
    }
    return null
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validate fields
    if (!email || !password || !confirmPassword) {
      setError('All fields are required')
      return
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    startTransition(async () => {
      try {
        const result = await signIn('credentials', {
          email,
          password,
          action: 'register',
          redirect: false,
        })

        if (result?.error) {
          if (result.error.includes('Email already in use')) {
            setError(t('auth.emailExists'))
          } else if (result.error.includes('Invalid email format')) {
            setError(t('auth.emailInvalid'))
          } else if (result.error.includes('Password must be')) {
            setError(result.error)
          } else {
            setError(result.error || 'Registration failed')
          }
        } else if (result?.ok) {
          setSuccess(t('auth.accountCreated'))
          // Auto sign in worked, redirect
          setTimeout(() => {
            router.push('/')
            router.refresh()
          }, 1500)
        }
      } catch {
        setError('An unexpected error occurred')
      }
    })
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('auth.register')}</h1>
        <p className="text-zinc-600">{t('auth.registerWithEmail')}</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 border border-green-200">
          {success}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
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
          <p className="mt-2 text-xs text-zinc-600">
            At least 8 characters with uppercase, lowercase, number, and special character
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-900">
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {isPending ? t('auth.creating') : t('auth.createAccount')}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-600">
        {t('auth.alreadyHaveAccount')}{' '}
        <Link href="./signin" className="font-medium text-blue-600 hover:text-blue-700">
          {t('auth.signin')}
        </Link>
      </p>
    </div>
  )
}
