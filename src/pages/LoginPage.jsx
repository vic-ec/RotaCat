import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthHero from '../components/AuthHero'
import AuthFooter from '../components/AuthFooter'

// Email + password sign-in form — shared by the desktop inline panel and
// the mobile sign-in modal so the two surfaces can't drift apart.
function SignInForm() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await signIn(email, password)

    setSubmitting(false)
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : error.message)
      return
    }
    navigate('/')
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 md:mt-8 md:gap-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
          Email
        </label>

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
          </span>

          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-2 pl-12 pr-4
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:border-rose focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
              md:py-3 md:text-lg"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-semibold text-ink md:text-base">
            Password
          </label>

          <Link
            to="/forgot-password"
            className="text-sm font-medium text-rose transition-colors hover:text-rose-dark hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 118 0v3" />
            </svg>
          </span>

          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-2 pl-12 pr-12
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:border-rose focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
              md:py-3 md:text-lg"
          />

          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-4 flex items-center text-ink-muted transition-colors hover:text-ink"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.94 10.94 0 0112 20C7 20 2.73 16.89 1 12c.73-2.06 2-3.85 3.6-5.22" />
                <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                <path d="M1 1l22 22" />
                <path d="M9.88 4.24A10.94 10.94 0 0112 4c5 0 9.27 3.11 11 8a11.83 11.83 0 01-4.24 5.18" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full rounded-lg bg-accent py-3 text-base font-semibold text-white
          transition-colors hover:bg-accent-dark
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
          disabled:opacity-60
          md:py-3.5 md:text-lg"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

// Full-screen backdrop + card carrying the sign-in form — mobile only,
// triggered from the "Sign in" choice button below.
function SignInModal({ onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 md:hidden"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-base font-semibold text-ink">Sign in to your account</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SignInForm />
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [showSignInModal, setShowSignInModal] = useState(false)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-accent px-4 py-2 md:py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
        <AuthHero />

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-10 md:px-[4.375rem] md:py-20">
          <div className="mx-auto w-full max-w-sm">

            {/* Desktop: title + inline form, unchanged */}
            <div className="hidden md:block">
              <p className="text-base font-semibold text-ink md:text-2xl lg:text-3xl">
                Sign in to your account
              </p>
              <SignInForm />
              <p className="mt-6 text-center text-xs text-ink-muted md:text-base">
                No account?{' '}
                <Link to="/signup" className="text-rose hover:text-rose-dark hover:underline">
                  Register here
                </Link>
              </p>
            </div>

            {/* Mobile: two entry-point buttons, form lives in a modal */}
            <div className="md:hidden">
              <p className="text-2xl font-semibold text-ink">Welcome back</p>
              <p className="mt-1 text-sm text-ink-muted">What would you like to do?</p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowSignInModal(true)}
                  className="w-full rounded-lg bg-accent py-3 text-base font-semibold text-white
                    transition-colors hover:bg-accent-dark
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
                >
                  Sign in
                </button>

                <Link
                  to="/signup"
                  className="w-full rounded-lg border border-accent bg-accent-tint py-3 text-center text-base font-semibold text-accent
                    transition-colors hover:bg-accent-light"
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AuthFooter />

      {showSignInModal && <SignInModal onClose={() => setShowSignInModal(false)} />}
    </div>
  )
}
