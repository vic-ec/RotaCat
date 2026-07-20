import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import AuthHero from '../components/AuthHero'

// Password rule: 8+ chars, at least one lower, one upper, one digit, one symbol
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'

// Small "i" icon next to the Password label — hover reveals requirements on
// desktop, tap toggles them on mobile (no hover there).
function PasswordRequirementsInfo() {
  const [show, setShow] = useState(false)
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        onBlur={() => setShow(false)}
        aria-label="Password requirements"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-muted text-[10px] font-semibold leading-none text-ink-muted transition-colors hover:border-ink hover:text-ink"
      >
        i
      </button>
      <span
        className={`pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs font-normal normal-case text-white shadow-card transition-opacity ${
          show ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {PASSWORD_HINT}
      </span>
    </span>
  )
}

export default function ResetPasswordPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!PASSWORD_RULE.test(password)) {
      setError(`Password doesn’t meet the requirements. ${PASSWORD_HINT}`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent px-4">
        <div className="w-full max-w-sm rounded-xl border border-accent/50 bg-canvas-raised p-8 text-center shadow-raised">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-xl text-ink">Password updated</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Your password has been reset. You're signed in — continue to your account.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 inline-block rounded-lg border border-accent bg-accent-tint px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-light"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  // Still resolving the recovery link from the URL
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent px-4">
        <p className="text-sm text-white">Verifying your reset link…</p>
      </div>
    )
  }

  // No session — the link was invalid, expired, or already used
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent px-4">
        <div className="w-full max-w-sm rounded-xl border border-accent/50 bg-canvas-raised p-8 text-center shadow-raised">
          <h2 className="font-display text-xl text-ink">Link expired</h2>
          <p className="mt-2 text-sm text-ink-muted">
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block rounded-lg border border-accent bg-accent-tint px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-light"
          >
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
        <AuthHero />

        <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-[4.375rem] md:px-[4.375rem] md:py-20">
          <div className="mx-auto w-full max-w-sm">
            <p className="text-2xl font-semibold text-ink lg:text-3xl">Set a new password</p>
            <p className="mt-2 text-sm text-ink-muted">Choose a new password for your account.</p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <div>
                <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-base font-semibold text-ink">
                  New password
                  <PasswordRequirementsInfo />
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-rose focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-base font-semibold text-ink">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-rose focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-accent py-3.5 text-lg font-semibold text-white
                  transition-colors hover:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                  disabled:opacity-60"
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
