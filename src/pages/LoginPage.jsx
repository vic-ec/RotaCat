import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import robotLily from '../assets/lily-robot-clean.png'

function Butterfly({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 6c-1-3-6-4-7-1-1 2.5 1.5 4.5 4 4.5" stroke="#7FD8E8" strokeWidth="1.4" fill="#7FD8E8" fillOpacity="0.55" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 6c1-3 6-4 7-1 1 2.5-1.5 4.5-4 4.5" stroke="#E888B0" strokeWidth="1.4" fill="#E888B0" fillOpacity="0.55" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8c-1 2.5-5 3.5-5.5 1-.4-2 2-3.2 4-2.3" stroke="#7FD8E8" strokeWidth="1.2" fill="#7FD8E8" fillOpacity="0.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8c1 2.5 5 3.5 5.5 1 .4-2-2-3.2-4-2.3" stroke="#E888B0" strokeWidth="1.2" fill="#E888B0" fillOpacity="0.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="5.5" x2="12" y2="13" stroke="#2A3550" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

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

        {/* Hero panel — title, tagline (with butterfly on the "g"), cat
            looking up toward it, all stacked in normal flow underneath. */}
        <div className="flex shrink-0 flex-col items-center bg-night-panel px-8 pt-10 pb-4 md:w-1/2 md:px-10">
          <div className="w-full">
            <h1 className="font-display text-4xl font-medium leading-none text-night-ink">
              Rota<span className="font-semibold">Cat</span>
            </h1>
            <p className="relative mt-1.5 inline-block text-sm text-night-gold">
              the smarter play in EC rosterin
              <span className="relative inline-block">
                g
                <Butterfly className="absolute -top-3.5 left-1 h-4 w-4 -rotate-12" />
              </span>
            </p>
          </div>

          <img
            src={robotLily}
            alt=""
            className="mt-2 h-auto max-h-[400px] w-auto max-w-[85%] select-none object-contain md:max-h-[440px]"
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
