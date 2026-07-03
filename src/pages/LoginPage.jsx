import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import robotLily from '../assets/lily-robot-navy.png'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
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
    <div className="flex min-h-screen items-center justify-center bg-night-bg p-4 md:p-8">
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-night-line shadow-raised md:flex-row md:h-[640px]">

        {/* Hero panel — robot Lily, brand mark. Full-bleed image with a
            gradient fade so the rectangular photo dissolves into the panel
            rather than showing a hard edge. */}
        <div className="relative flex shrink-0 flex-col justify-start overflow-hidden bg-night-panel px-8 pt-8 pb-6 md:w-1/2 md:px-10 md:pt-10">
          <div>
            <h1 className="font-display text-4xl font-medium leading-none text-night-ink">
              Rota<span className="font-semibold">Cat</span>
            </h1>
            <p className="mt-1.5 text-sm text-night-gold">
              the smarter play in EC rostering
            </p>
          </div>

          <img
            src={robotLily}
            alt=""
            className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[320px] w-auto select-none object-contain md:h-[420px]"
            draggable="false"
          />
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center bg-night-card px-8 py-8 md:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h2 className="text-xl font-semibold text-night-ink">Welcome back</h2>
            <p className="mt-1 text-sm text-night-muted">Please sign in to your account</p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-night-ink">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded border border-night-line bg-night-bg px-3.5 py-2.5
                    text-sm text-night-ink placeholder:text-night-muted
                    transition-colors focus:border-night-accent
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-night-accent/25"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-night-ink">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded border border-night-line bg-night-bg px-3.5 py-2.5 pr-10
                      text-sm text-night-ink placeholder:text-night-muted
                      transition-colors focus:border-night-accent
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-night-accent/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-xs font-medium text-night-muted hover:text-night-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-night-muted">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-night-line bg-night-bg accent-night-accent"
                  />
                  Remember me
                </label>
                {/* Not yet wired to a reset-password flow — visual placeholder only */}
                <span className="cursor-not-allowed text-night-accent/60" title="Coming soon">
                  Forgot password?
                </span>
              </div>

              {error && (
                <div className="rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-1 w-full rounded bg-night-accent py-3 text-sm font-semibold text-white
                  transition-colors hover:bg-night-accentDark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-accent
                  disabled:opacity-60"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-night-muted">
              Need help?{' '}
              <a href="mailto:support@vhw.co.za" className="font-medium text-night-accent hover:underline">
                Contact support
              </a>
            </p>

            <p className="mt-3 text-center text-xs text-night-muted">
              Don't have an account?{' '}
              <Link to="/signup" className="font-medium text-night-accent hover:underline">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
