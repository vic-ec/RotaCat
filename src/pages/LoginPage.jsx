import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isValidEmail } from '../lib/validateEmail'
import AuthHero from '../components/AuthHero'
import MobileAuthHero from '../components/MobileAuthHero'
import AuthFooter from '../components/AuthFooter'
import CapsLockNotice from '../components/CapsLockNotice'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'

// Email + password sign-in form — shared by the desktop inline panel and
// the mobile sign-in modal so the two surfaces can't drift apart.
// `autoFocus` is only set true from the modal context, so the desktop
// inline panel doesn't grab focus away from the page on load.
function SignInForm({ autoFocus = false }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const emailRef = useRef(null)
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const capsLock = useCapsLockWarning()

  const emailInvalid = emailTouched && email.length > 0 && !isValidEmail(email)

  // The modal that hosts this form on mobile stays mounted (just hidden)
  // so password managers can discover the fields on page load, which
  // means the native `autofocus` attribute — a one-time, mount-triggered
  // effect — won't fire again on repeat opens. Focus imperatively instead,
  // keyed off the `autoFocus` prop actually flipping to true. Also reset
  // the reveal-password toggle here — since the form never unmounts, it'd
  // otherwise stay revealed from a previous open (e.g. after closing the
  // modal by clicking outside it) rather than defaulting back to hidden.
  useEffect(() => {
    if (autoFocus) {
      emailRef.current?.focus()
      setShowPassword(false)
    }
  }, [autoFocus])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await signIn(email, password)

    setSubmitting(false)
    if (error) {
      if (error.message === 'Invalid login credentials') {
        setError('Incorrect email or password.')
      } else {
        setError(error.message && error.message !== '{}' ? error.message : 'Something went wrong. Please try again.')
      }
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
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            ref={emailRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailInvalid}
            placeholder="you@example.com"
            className={`w-full rounded-lg border-2 bg-canvas-raised py-2 pl-12 pr-4
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2
              md:py-3 md:text-lg
              ${emailInvalid
                ? 'border-flagRed/60 focus:border-flagRed focus:outline-flagRed/25'
                : 'border-accent/50 focus:border-accent focus:outline-accent/25'}`}
          />
        </div>
        {emailInvalid && (
          <p className="mt-1 text-xs text-flagRed">Enter a valid email address.</p>
        )}
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
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={capsLock.onKeyDown}
            onKeyUp={capsLock.onKeyUp}
            onBlur={capsLock.onBlur}
            placeholder="••••••••"
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-2 pl-12 pr-12
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:border-accent focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25
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
        <CapsLockNotice show={capsLock.capsOn} />
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
          transition-colors hover:bg-accent-dark active:bg-accent-dark
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
          disabled:opacity-60
          md:py-3.5 md:text-lg"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

// Full-screen backdrop + card carrying the sign-in form — shared by the
// mobile and desktop "Welcome" landings, both of which trigger it from a
// "Sign in" choice button. Stays mounted rather than being conditionally
// rendered, so the email/password fields exist in the DOM from page load
// — some password managers only scan for fillable fields once at load and
// never notice ones added later by a modal opening. Hidden via
// opacity/pointer-events instead of `display:none` (`hidden`): a
// display:none subtree reads as absent to a number of autofill engines —
// `offsetParent` is null, same as if the fields didn't exist — which
// defeated the whole point of keeping it mounted for at least one
// password manager reported not picking up the fields anymore.
// opacity-0 keeps it laid out and "visible" enough to be discovered,
// while pointer-events-none stops the invisible backdrop from eating
// clicks meant for the page underneath.
function SignInModal({ isOpen, onClose, triggerRef }) {
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Return focus to whatever triggered the modal (the "Sign in" button,
  // captured synchronously by the caller's click handler — not read here
  // via document.activeElement, since that would race the sign-in form's
  // own autofocus effect and end up capturing the email field instead).
  useEffect(() => {
    if (!isOpen) triggerRef.current?.focus?.()
  }, [isOpen, triggerRef])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink/65 p-4 backdrop-blur-sm ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-line bg-canvas-raised p-5 shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-lg font-semibold text-ink">Sign in to your account</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SignInForm autoFocus={isOpen} />
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [showSignInModal, setShowSignInModal] = useState(false)
  const signInTriggerRef = useRef(null)

  function openSignInModal(e) {
    signInTriggerRef.current = e.currentTarget
    setShowSignInModal(true)
  }

  return (
    <>
      {/* Mobile: full-bleed hero + rounded bottom sheet, no outer background frame */}
      <div className="flex h-dvh flex-col bg-canvas-raised md:hidden">
        <MobileAuthHero />

        <div className="relative -mt-[28px] flex min-h-[34dvh] flex-none flex-col justify-center rounded-t-[28px] bg-accent-panel px-8 pt-[34px] pb-4">
          <p className="text-center text-2xl font-semibold text-ink">Welcome</p>
          <p className="mt-2 text-center text-[14.7px] text-ink-light">Get started with your account</p>

          <div className="mt-6">
            <button
              type="button"
              onClick={openSignInModal}
              className="w-full rounded-lg bg-accent py-6 text-[14.7px] font-semibold text-white
                transition-colors hover:bg-accent-dark active:bg-accent-dark
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
            >
              Sign in
            </button>

            <Link
              to="/forgot-password"
              className="mt-3 block text-center text-[14.7px] font-medium text-accent transition-colors hover:text-accent-dark hover:underline"
            >
              Forgot password?
            </Link>

            <p className="mt-5 text-center text-[14.7px] text-ink-light">
              New here?{' '}
              <Link to="/signup" className="font-semibold text-rose hover:text-rose-dark hover:underline">
                Create an account
              </Link>
            </p>
          </div>

          <AuthFooter onLight topGap="mt-4" compact />
        </div>
      </div>

      {/* Desktop: split-screen card, same Welcome landing as mobile */}
      <div className="hidden min-h-screen flex-col items-center justify-center bg-accent px-4 py-10 md:flex">
        <div className="flex w-full max-w-[80rem] overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
          <AuthHero />

          <div className="flex flex-1 flex-col bg-accent-panel px-[4.375rem] py-[5.75rem]">
            <div className="flex flex-1 items-center justify-center">
              <div className="mx-auto w-full max-w-sm text-center">
                <p className="text-3xl font-semibold text-ink lg:text-4xl">Welcome</p>
                <p className="mt-2 text-[18.9px] text-ink-light lg:text-[23.1px]">Sign in to manage your shifts.</p>

                <div className="mt-8">
                  {/* border-2 border-transparent + py-[25px] matches this
                      button's total height exactly to the Signup page's
                      role cards (border-2 + p-4 + two lines of text =
                      82px) — same border+padding-match approach used for
                      the Account page's ghost-box inputs. */}
                  <button
                    type="button"
                    onClick={openSignInModal}
                    className="w-full rounded-lg border-2 border-transparent bg-accent py-[25px] text-[18.9px] font-semibold text-white
                      transition-colors hover:bg-accent-dark active:bg-accent-dark
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                      lg:text-[23.1px]"
                  >
                    Sign in
                  </button>

                  <Link
                    to="/forgot-password"
                    className="mt-4 block text-center text-[18.9px] font-medium text-rose transition-colors hover:text-rose-dark hover:underline lg:text-[23.1px]"
                  >
                    Forgot password?
                  </Link>

                  <p className="mt-6 text-center text-[18.9px] text-ink-light lg:text-[23.1px]">
                    New here?{' '}
                    <Link to="/signup" className="font-semibold text-rose hover:text-rose-dark hover:underline">
                      Create an account
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            {/* Copyright pinned to the panel's own bottom edge (via the
                flex-1 centering wrapper above absorbing the leftover space)
                rather than floating below the whole card on the outer teal
                background — reads as part of this panel, not an afterthought. */}
            <AuthFooter onLight compact />
          </div>
        </div>
      </div>

      <SignInModal isOpen={showSignInModal} onClose={() => setShowSignInModal(false)} triggerRef={signInTriggerRef} />
    </>
  )
}
