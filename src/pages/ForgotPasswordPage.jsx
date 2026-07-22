emimport { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isValidEmail } from '../lib/validateEmail'
import AuthHero from '../components/AuthHero'
import MobileAuthHero from '../components/MobileAuthHero'
import AuthFooter from '../components/AuthFooter'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const emailInvalid = emailTouched && email.length > 0 && !isValidEmail(email)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <>
        {/* Mobile: full-bleed hero + rounded bottom sheet, matching login/signup */}
        <div className="flex h-screen flex-col bg-canvas-raised md:hidden">
          <MobileAuthHero />

          <div className="relative -mt-[28px] flex min-h-[34vh] flex-none flex-col justify-center rounded-t-[28px] bg-accent-panel px-8 pt-8 pb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-xl text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-ink-light">
              If an account exists for {email}, we've sent a link to reset your password.
              It'll expire after a while, so use it soon.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-lg border border-accent bg-accent-tint px-4 py-4 text-sm font-semibold text-accent transition-colors hover:bg-accent-light"
            >
              Back to sign in
            </Link>

            <AuthFooter onLight topGap="mt-4" compact />
          </div>
        </div>

        {/* Desktop: unchanged */}
        <div className="hidden min-h-screen flex-col items-center justify-center bg-accent px-4 md:flex">
          <div className="w-full max-w-sm rounded-xl border border-accent/50 bg-canvas-raised p-8 text-center shadow-raised">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-xl text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-ink-muted">
              If an account exists for {email}, we've sent a link to reset your password.
              It'll expire after a while, so use it soon.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-block rounded-lg border border-accent bg-accent-tint px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-light"
            >
              Back to sign in
            </Link>
          </div>
          <AuthFooter compact />
        </div>
      </>
    )
  }

  return (
    <>
      {/* Mobile: full-bleed hero + rounded bottom sheet, matching login/signup */}
      <div className="flex h-screen flex-col bg-canvas-raised md:hidden">
        <MobileAuthHero />

        <div className="relative -mt-[28px] flex min-h-[34vh] flex-none flex-col justify-center rounded-t-[28px] bg-accent-panel px-8 pt-8 pb-4">
          <p className="text-center text-2xl font-semibold text-ink">Reset your password</p>
          {/* min-h reserves space for 2 lines even when the copy fits on
              one — on wider phones it wraps to a single line, which would
              otherwise shrink the sheet below login/signup's height. */}
          <p className="mt-2 flex min-h-[40px] items-center justify-center text-center text-sm text-ink-light">
            Enter your account email and we'll send a password-reset link.
          </p>

          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  aria-invalid={emailInvalid}
                  placeholder="you@example.com"
                  className={`w-full rounded-lg border-2 bg-canvas-raised py-2 pl-12 pr-4
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2
                    ${emailInvalid
                      ? 'border-flagRed/60 focus:border-flagRed focus:outline-flagRed/25'
                      : 'border-accent/50 focus:border-rose focus:outline-rose/25'}`}
                />
              </div>
              {emailInvalid && (
                <p className="mt-1 text-xs text-flagRed">Enter a valid email address.</p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-accent py-3 text-base font-semibold text-white
                transition-colors hover:bg-accent-dark
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-2 text-center text-xs text-ink-light">
            Remembered it after all?{' '}
            <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
              Sign in
            </Link>
          </p>

          <AuthFooter onLight topGap="mt-4" compact />
        </div>
      </div>

      {/* Desktop: unchanged */}
      <div className="hidden min-h-screen flex-col items-center justify-center bg-accent px-4 py-3 md:flex md:py-10">
        <div className="flex w-full max-w-[80rem] overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
          <AuthHero />

          <div className="flex flex-1 flex-col justify-center bg-accent-panel px-[4.375rem] py-20">
            <div className="mx-auto w-full max-w-sm">
              <p className="text-2xl font-semibold text-ink lg:text-3xl">Reset your password</p>
              <p className="mt-2 text-base text-ink-light">
                Enter your account email and we'll send a password-reset link.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
                <div>
                  <label htmlFor="email-desktop" className="mb-1.5 block text-base font-semibold text-ink">
                    Email
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="M3 7l9 6 9-6" />
                      </svg>
                    </span>
                    <input
                      id="email-desktop"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      aria-invalid={emailInvalid}
                      placeholder="you@example.com"
                      className={`w-full rounded-lg border-2 bg-canvas-raised py-3 pl-12 pr-4
                        text-lg text-ink placeholder:text-ink-muted
                        transition-colors focus:bg-canvas-raised
                        focus:outline focus:outline-2 focus:outline-offset-2
                        ${emailInvalid
                          ? 'border-flagRed/60 focus:border-flagRed focus:outline-flagRed/25'
                          : 'border-accent/50 focus:border-rose focus:outline-rose/25'}`}
                    />
                  </div>
                  {emailInvalid && (
                    <p className="mt-1 text-xs text-flagRed">Enter a valid email address.</p>
                  )}
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
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="mt-6 text-center text-base text-ink-light">
                Remembered it after all?{' '}
                <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>

        <AuthFooter compact />
      </div>
    </>
  )
}
