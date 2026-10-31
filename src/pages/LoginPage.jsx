import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { isValidEmail } from '../lib/validateEmail'
import { useIsDesktop } from '../lib/useIsDesktop'
import AuthHero from '../components/AuthHero'
import MobileAuthHero from '../components/MobileAuthHero'
import AuthFooter from '../components/AuthFooter'
import SignInForm, { CredentialErrorBanner } from '../components/SignInForm'
import TurnstileWidget, { TURNSTILE_ENABLED } from '../components/TurnstileWidget'

// Links on this page are teal and underlined. Rose on white is 3.80:1 and
// misses AA; teal is 5.47:1. Rose stays a brand accent (the collar), not a
// text colour.
const LINK_CLASS = 'font-medium text-accent underline decoration-accent/45 underline-offset-4 transition-colors hover:text-accent-dark hover:decoration-accent-dark'

// `inert` keeps a subtree out of the tab order and away from assistive
// tech. React 18 only forwards it as a string attribute (a boolean is
// dropped with a warning), hence the spread of `{ inert: '' }` rather than
// `inert={true}`; React 19 would take the boolean.
const inertWhen = (condition) => (condition ? { inert: '' } : {})

// Full-screen backdrop + card carrying the sign-in form below `lg` — the
// mobile sheet and the tablet-width card both open it from their "Sign in"
// button; from `lg` up the form is inline and this is not rendered at all.
// Stays mounted (not conditionally rendered) while it is in play, so the
// email/password fields exist in the DOM from page load — some password
// managers only scan for fillable fields once at load and never notice
// ones added later by a modal opening. Hidden via opacity/pointer-events
// instead of `display:none` (`hidden`): a display:none subtree reads as
// absent to a number of autofill engines — `offsetParent` is null, same
// as if the fields didn't exist — which defeated the whole point of
// keeping it mounted for at least one password manager reported not
// picking up the fields anymore. opacity-0 keeps it laid out and
// "visible" enough to be discovered, while pointer-events-none stops the
// invisible backdrop from eating clicks meant for the page underneath.
// `inert` while closed is what keeps those invisible fields out of the
// tab order and away from a screen reader's virtual cursor.
function SignInModal({ isOpen, onClose, triggerRef, formProps }) {
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
      className={`fixed inset-0 z-50 flex items-center justify-center scrim-heavy p-4 backdrop-blur-sm ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
      {...inertWhen(!isOpen)}
    >
      {/* `relative` is the anchor for the form's credential banner, which
          sits above this panel (and so above the title) without pushing
          the fields down. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="relative w-full max-w-sm rounded-xl border border-edge bg-canvas-raised p-5 shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="signin-title" className="text-lg font-semibold text-ink">Sign in to your account</h2>
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
        <SignInForm variant="modal" autoFocus={isOpen} {...formProps} />
      </div>
    </div>
  )
}

// Same chrome/mechanics as SignInModal (fixed backdrop, Escape-to-close,
// click-outside-to-close, focus returned to whatever opened it) — kept as
// its own component rather than folded into SignInModal since the two are
// mutually exclusive (only one open at a time) and swapping content
// in-place would need its own submitted/not-submitted branch anyway.
// Stays mounted always (isOpen just toggles visibility) for the same
// reason SignInModal does, so the fade-free open/close stays instant and
// consistent between the two.
function ForgotPasswordModal({ isOpen, onClose, onBackToSignIn, triggerRef }) {
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)
  const emailRef = useRef(null)

  const emailInvalid = emailTouched && email.length > 0 && !isValidEmail(email)

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) triggerRef.current?.focus?.()
  }, [isOpen, triggerRef])

  useEffect(() => {
    if (isOpen) emailRef.current?.focus()
  }, [isOpen])

  // Closing (X, backdrop, Escape, or "Back to sign in") resets the form —
  // otherwise reopening after a successful request would keep showing
  // "Check your email" instead of a fresh form for a different address.
  useEffect(() => {
    if (!isOpen) {
      setSubmitted(false)
      setEmail('')
      setEmailTouched(false)
      setError('')
    }
  }, [isOpen])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (TURNSTILE_ENABLED && !captchaToken) {
      setError('Please complete the verification check.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    })
    setSubmitting(false)
    // A Turnstile token is single-use — reset for a fresh one regardless
    // of outcome, otherwise a retry after a failed request would submit
    // the same already-consumed token.
    turnstileRef.current?.reset()
    setCaptchaToken('')

    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center scrim-heavy p-4 backdrop-blur-sm ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
      {...inertWhen(!isOpen)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
        className="w-full max-w-sm rounded-xl border border-edge bg-canvas-raised p-5 shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 id="forgot-title" className="font-display text-xl font-bold text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-ink-muted">
              If an account exists for {email}, we&apos;ve sent a link to reset your password.
              It&apos;ll expire after a while, so use it soon.
            </p>
            <button
              type="button"
              onClick={onBackToSignIn}
              className="mt-6 inline-block rounded-lg border border-accent bg-accent-tint px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-light active:bg-accent-light"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <h2 id="forgot-title" className="text-lg font-semibold text-ink">Reset your password</h2>
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
            <p className="text-sm text-ink-muted">
              Enter your account email and we&apos;ll send a password-reset link.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-semibold text-ink">
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
                    id="forgot-email"
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
                    aria-describedby={emailInvalid ? 'forgot-email-error' : undefined}
                    placeholder="Your email"
                    className={`w-full rounded-lg border-2 bg-field py-2 pl-12 pr-4
                      text-base text-ink placeholder:text-ink-muted
                      transition-colors focus:bg-field
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent
                      ${emailInvalid
                        ? 'border-flagRed'
                        : 'border-accent/70 focus:border-accent'}`}
                  />
                </div>
                {emailInvalid && (
                  <p id="forgot-email-error" className="mt-1 text-sm text-flagRed">Enter a valid email address.</p>
                )}
              </div>

              {TURNSTILE_ENABLED && (
                <TurnstileWidget ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
              )}

              {error && (
                <div role="alert" className="rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (TURNSTILE_ENABLED && !captchaToken)}
                className="w-full rounded-lg bg-accent py-3 text-base font-semibold text-on-fill
                  transition-colors hover:bg-accent-dark active:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
                  disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-3 text-center text-xs text-ink-light">
              Remembered it after all?{' '}
              <button type="button" onClick={onBackToSignIn} className={LINK_CLASS}>
                Sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  // Matches the `lg:` breakpoint. From here up the sign-in form is inline
  // in the shell's right half; below it the Welcome button opens the
  // modal. The two are swapped in the DOM, not just in CSS, so exactly one
  // form — one `#email`, one `#password` — exists at any width.
  const isDesktop = useIsDesktop(1024)

  const [showSignInModal, setShowSignInModal] = useState(false)
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false)
  const signInTriggerRef = useRef(null)
  const forgotTriggerRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Sign-in state the page owns and hands to whichever SignInForm is
  // mounted: the credential-error text, the in-flight flag, and the
  // Turnstile token (with the widget's reset handle, since a token is
  // single-use and has to be refreshed after every attempt).
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)
  const verifying = TURNSTILE_ENABLED && !captchaToken

  // Deep link from ResetPasswordPage's "Request a new link" (an expired
  // recovery link lands there) — auto-opens this modal instead of landing
  // on the bare Welcome page with an extra click required. One-shot: the
  // param is stripped right back out so it doesn't reopen on a later
  // back-navigation to this same URL.
  useEffect(() => {
    if (searchParams.get('forgot') === '1') {
      setShowForgotPasswordModal(true)
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('forgot')
        return next
      }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount
  }, [])

  // The sign-in modal has no counterpart from `lg` up (the form is inline),
  // so a window widened past the breakpoint with it open must not leave a
  // phantom "open" flag that would re-show it the moment the window shrinks.
  useEffect(() => {
    if (isDesktop) setShowSignInModal(false)
  }, [isDesktop])

  async function handleSignIn(email, password) {
    setError(null)

    if (verifying) {
      setError('Please complete the verification check.')
      return { ok: false, invalidCredentials: false }
    }

    setSubmitting(true)
    const { error: signInError } = await signIn(email, password, captchaToken)
    setSubmitting(false)
    // A Turnstile token is single-use — reset for a fresh one regardless
    // of outcome, otherwise a retry after a failed sign-in would submit
    // the same already-consumed token.
    turnstileRef.current?.reset()
    setCaptchaToken('')

    if (signInError) {
      const invalidCredentials = signInError.message === 'Invalid login credentials'
      if (invalidCredentials) {
        setError('Incorrect email or password.')
      } else {
        setError(signInError.message && signInError.message !== '{}' ? signInError.message : 'Something went wrong. Please try again.')
      }
      return { ok: false, invalidCredentials }
    }
    navigate('/')
    return { ok: true, invalidCredentials: false }
  }

  function openSignInModal(e) {
    signInTriggerRef.current = e.currentTarget
    setShowSignInModal(true)
  }

  function openForgotPasswordModal(e) {
    if (e?.currentTarget) forgotTriggerRef.current = e.currentTarget
    setShowSignInModal(false)
    setShowForgotPasswordModal(true)
  }

  function backToSignInFromForgot() {
    setShowForgotPasswordModal(false)
    // From `lg` up the form is already on the page; there is no modal to
    // return to, so this just closes the sheet and hands focus back.
    if (!isDesktop) setShowSignInModal(true)
  }

  const modalOpen = showSignInModal || showForgotPasswordModal

  const formProps = {
    onSubmit: handleSignIn,
    error,
    submitting,
    verifying,
    onForgotPassword: openForgotPasswordModal,
    captcha: TURNSTILE_ENABLED
      ? <TurnstileWidget ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
      : null,
  }

  return (
    <>
      {/* Mobile: full-bleed hero + rounded bottom sheet, no outer background
          frame. `min-h-` rather than `h-` on both the column and the sheet so
          200% text has room to grow and the page scrolls instead of clipping.
          The whole landing goes `inert` while a modal is open, so Tab and a
          screen reader's cursor stay inside the dialog. */}
      <div className="flex min-h-dvh flex-col bg-auth-hero md:hidden" {...inertWhen(modalOpen)}>
        <MobileAuthHero />

        <div className="relative -mt-[28px] flex min-h-[44dvh] flex-none flex-col justify-center rounded-t-[28px] bg-accent-panel px-8 py-4">
          <h2 className="text-center text-2xl font-semibold text-ink">Welcome</h2>
          <p className="mt-2 text-center text-[14.7px] text-ink-light">Sign in to manage your shifts</p>

          <div className="mt-6">
            <button
              type="button"
              onClick={openSignInModal}
              className="w-full rounded-lg bg-accent py-6 text-lg font-bold text-on-fill
                transition-colors hover:bg-accent-dark active:bg-accent-dark
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={openForgotPasswordModal}
              className={`mt-3 block w-full text-center text-xs ${LINK_CLASS}`}
            >
              Forgot password?
            </button>

            <p className="mt-5 text-center text-[14.7px] text-ink-light">
              New here?{' '}
              <Link to="/signup" className={LINK_CLASS}>
                Create an account
              </Link>
            </p>
          </div>

          <AuthFooter onLight topGap="mt-4" />
        </div>
      </div>

      {/* Tablet and desktop: one raised white shell on a light-mint page,
          two flush white halves with a 1px seam between them. The side
          inset scales with the viewport (64px at 1600px) and the shell is
          as tall as its content, like the Create-account card: the brand
          half's own padding sets the height, and the halves stay 50/50.
          From `lg` the form is inline; between `md` and `lg` the Welcome
          button + modal remain. */}
      <div
        className="hidden min-h-dvh flex-col items-center justify-center bg-auth-page px-[4vw] py-[3.75vw] md:flex"
        {...inertWhen(modalOpen)}
      >
        <div className="mx-auto flex w-full max-w-[1800px] overflow-hidden rounded-[24px] border border-auth-shell-border bg-auth-panel shadow-auth-shell md:flex-row">
          <AuthHero seam="shell" />

          <div className="flex flex-1 flex-col bg-auth-panel px-10 pb-8 lg:px-[4.375rem]">
            {isDesktop ? (
              /* Three rows: equal slack above and below the form keeps it
                 vertically centred, and the top row is exactly the room
                 between the half's top edge and the Welcome heading, so
                 the banner centred in it has the same space above it as
                 below. It is out of the form's flow, so nothing moves. */
              <div className="grid flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] justify-items-center">
                <div className="flex w-full max-w-[456px] items-center">
                  <CredentialErrorBanner error={error} />
                </div>
                <SignInForm variant="inline" {...formProps} />
                <div aria-hidden="true" />
              </div>
            ) : (
            <div className="flex flex-1 items-center justify-center pt-12">
                <div className="mx-auto w-full max-w-sm text-center">
                  <h2 className="text-3xl font-semibold text-ink lg:text-4xl">Welcome</h2>
                  <p className="mt-5 text-[18.9px] text-ink-light lg:text-[23.1px]">Sign in to manage your shifts</p>

                  <div className="mt-5">
                    {/* border-2 border-transparent + py-[25px] matches this
                        button's total height exactly to the Signup page's
                        role cards (border-2 + p-4 + two lines of text =
                        82px) — same border+padding-match approach used for
                        the Account page's ghost-box inputs. */}
                    <button
                      type="button"
                      onClick={openSignInModal}
                      className="w-full rounded-[14px] border-2 border-transparent bg-accent py-[25px] text-lg font-bold text-on-fill
                        transition-colors hover:bg-accent-dark active:bg-accent-dark
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Sign in
                    </button>

                    <button
                      type="button"
                      onClick={openForgotPasswordModal}
                      className={`mt-4 block w-full text-center text-base ${LINK_CLASS}`}
                    >
                      Forgot password?
                    </button>

                    <p className="mt-6 text-center text-[18.9px] text-ink-light lg:text-[23.1px]">
                      New here?{' '}
                      <Link to="/signup" className={LINK_CLASS}>
                        Create an account
                      </Link>
                    </p>
                  </div>
                </div>
            </div>
            )}

            {/* Copyright pinned to the half's own bottom edge (via the
                flex-1 centering wrapper above absorbing the leftover space)
                rather than floating below the shell on the mint page —
                reads as part of this half, not an afterthought. */}
            <AuthFooter onLight topGap="mt-6" />
          </div>
        </div>
      </div>

      {!isDesktop && (
        <SignInModal
          isOpen={showSignInModal}
          onClose={() => setShowSignInModal(false)}
          triggerRef={signInTriggerRef}
          formProps={formProps}
        />
      )}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        onBackToSignIn={backToSignInFromForgot}
        triggerRef={forgotTriggerRef}
      />
    </>
  )
}
