import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { isValidEmail } from '../lib/validateEmail'
import CapsLockNotice from './CapsLockNotice'
import PasswordRevealToggle from './PasswordRevealToggle'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'

// The email + password sign-in form. One component, two mounts: inline in
// the login shell's right half from `lg` up, and inside LoginPage's
// SignInModal below that. Only ever one of the two is in the DOM at a time
// (LoginPage switches on the same 1024px the `lg:` classes use), which is
// what lets the field ids stay the plain `email` / `password` that
// password managers like best without ever duplicating an id.
//
// What belongs to the form stays here: the two values and whether the
// email looks valid, the reveal toggle, Caps Lock, and the refs it needs to
// put focus somewhere useful after a failed attempt. What the page owns
// comes down as props: `onSubmit(email, password)` (which resolves to
// `{ ok, invalidCredentials }`), the credential-error text in `error`,
// `submitting`, `verifying` (Turnstile has not produced a token yet) and
// the Turnstile widget itself as `captcha`, so the page keeps the token
// and the reset handle in one place.
//
// Fixed field positions (docs/design/login-redesign/SPEC.md): nothing the
// form does may move the Email field, the Password field or the Sign in
// button. The error banner is absolutely positioned above the heading, so
// it takes no layout space, and the per-field messages (invalid email,
// Caps Lock, the Turnstile wait) are drawn as zero-height elements inside
// the 22px gap below their field.
//
// `variant` only decides two things: whether the Welcome heading, subtitle
// and "Create an account" line are part of the form (inline) or supplied
// by the modal around it (modal), and what the banner is anchored to — the
// form itself when inline, the modal's own panel when not (the panel is
// `relative`, so the banner lands above the modal title).

const FIELD_BASE = `w-full rounded-[14px] border-2 bg-field py-2 pl-12
  text-base text-ink placeholder:text-ink-muted
  transition-colors
  focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent
  md:py-3 md:text-lg`

function fieldClass(invalid, extra) {
  return `${FIELD_BASE} ${extra} ${invalid ? 'border-flagRed' : 'border-accent/70 focus:border-accent'}`
}

// A zero-height slot inside the 22px gap under a field. `overflow-visible`
// lets its one line of 14px text paint; `translate-y-[6px]` sits it just
// below the field's border. Whatever it holds, the next field never moves.
function FieldMessageSlot({ children, className = '' }) {
  return (
    <div className={`h-0 overflow-visible ${className}`}>
      <div className="translate-y-[6px]">{children}</div>
    </div>
  )
}

function AlertIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-12a1 1 0 011 1v4a1 1 0 11-2 0V7a1 1 0 011-1zm0 8.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

const LINK_CLASS = 'font-medium text-accent underline decoration-accent/45 underline-offset-4 transition-colors hover:text-accent-dark hover:decoration-accent-dark'

// The credential-error banner: icon, text and a small Dismiss in a red
// box. It is absolutely centred over the fixed-height message slot under
// the Sign in button (shared with the Turnstile status line), so it can be
// a little taller than the slot without moving the link below — it just
// borrows a few pixels of the gaps either side. Always mounted, so a
// screen reader's live region exists before it has anything to say;
// `empty:hidden` keeps the empty region from painting.
function CredentialErrorMessage({ error, onDismiss }) {
  return (
    <p
      role="alert"
      aria-live="assertive"
      className="absolute left-0 right-0 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-lg border border-flagRed/30 bg-flagRed-bg py-1.5 pl-4 pr-1.5 text-sm text-flagRed empty:hidden"
    >
      {error && (
        <>
          <AlertIcon />
          <span className="min-w-0 flex-1 truncate" title={error}>{error}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flagRed transition-colors hover:bg-flagRed/10"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </>
      )}
    </p>
  )
}

export default function SignInForm({
  variant = 'inline',
  onSubmit,
  error = null,
  submitting = false,
  verifying = false,
  captcha = null,
  onForgotPassword,
  onDismissError,
  autoFocus = false,
}) {
  const inline = variant === 'inline'
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Set after the server rejects the pair; cleared the moment either field
  // changes, so the red outlines go as soon as the user starts fixing it.
  const [credentialsRejected, setCredentialsRejected] = useState(false)
  const capsLock = useCapsLockWarning()

  const emailInvalid = emailTouched && email.length > 0 && !isValidEmail(email)
  const busy = submitting || verifying

  // The modal that hosts this form below `lg` stays mounted (just hidden)
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
    // `aria-disabled` rather than `disabled` keeps the button in the tab
    // order and lets the status line explain the wait, so the guard
    // against a premature submit has to live here.
    if (busy) return
    const result = await onSubmit?.(email, password)
    if (result?.invalidCredentials) {
      setCredentialsRejected(true)
      // Put the cursor where the fix most likely is, with the old value
      // selected so typing replaces it.
      passwordRef.current?.focus()
      passwordRef.current?.select()
    }
  }

  const emailDescribedBy = emailInvalid ? 'email-error' : undefined

  // Dismissing the banner also withdraws the red outlines and puts the
  // cursor back in the password field, since the Dismiss button it was on
  // is about to disappear.
  function handleDismissError() {
    onDismissError?.()
    setCredentialsRejected(false)
    passwordRef.current?.focus()
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={submitting}
      className={`flex w-full max-w-[456px] flex-col gap-[22px] ${inline ? '' : 'mt-3'}`}
    >
      {/* One column, one 22px gap between every element, centred as a
          whole in the half by LoginPage. The title is the first element
          inline; the modal has its own. The negative side margins let the
          36px title use the half's padding, so it holds one line down to
          about a 1300px window instead of breaking at the 456px column. */}
      {inline && (
        <h2 className="-mx-12 text-center text-3xl font-semibold text-ink lg:text-4xl">Sign in to manage your shifts</h2>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
          Email
        </label>

        {/* The wrapper carries the input's own font-size. Chromium (and
            so Edge) draws an autofill *preview* — the saved credentials
            shown before the user touches the field — with
            `font-size: inherit !important`, i.e. the wrapper's size, not
            the input's. With the two equal the preview and the committed
            value are the same size, instead of jumping on first click. */}
        <div className="relative text-base md:text-lg">
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
            onChange={(e) => { setEmail(e.target.value); setCredentialsRejected(false) }}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailInvalid || credentialsRejected}
            aria-describedby={emailDescribedBy}
            placeholder="Your email"
            className={fieldClass(emailInvalid || credentialsRejected, 'pr-4')}
          />
        </div>

        <FieldMessageSlot>
          {emailInvalid && (
            <p id="email-error" className="flex items-center gap-1.5 text-sm text-flagRed">
              <AlertIcon />
              Enter a valid email address.
            </p>
          )}
        </FieldMessageSlot>
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
          Password
        </label>

        <div className="relative text-base md:text-lg">
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
            ref={passwordRef}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setCredentialsRejected(false) }}
            onKeyDown={capsLock.onKeyDown}
            onKeyUp={capsLock.onKeyUp}
            aria-invalid={credentialsRejected}
            placeholder="••••••••"
            className={fieldClass(credentialsRejected, 'pr-12')}
          />

          <PasswordRevealToggle
            revealed={showPassword}
            onToggle={() => setShowPassword((prev) => !prev)}
            controls="password"
          />
        </div>

        {/* One row under the field: Caps Lock notice on the left, "Forgot
            password?" on the right, both centred on the same line. The row
            is always there, so the notice coming and going moves nothing.
            The link comes after the field in the DOM so the tab order runs
            Email → Password → Show → Forgot → Sign in. */}
        <div className="mt-2 flex items-center justify-between gap-4">
          <CapsLockNotice show={capsLock.capsOn} className="text-sm" />
          <button type="button" onClick={onForgotPassword} className={`ml-auto text-sm md:text-base ${LINK_CLASS}`}>
            Forgot password?
          </button>
        </div>
      </div>

      {captcha}

      <div>
        {/* `aria-disabled` keeps the button focusable while Turnstile is
            still fetching a token, so a keyboard or screen-reader user can
            land on it and hear why it is waiting; the submit handler is
            what actually refuses the click. */}
        <button
          type="submit"
          aria-disabled={busy || undefined}
          aria-describedby="verify-status"
          className="flex w-full items-center justify-center gap-3 rounded-[14px] bg-accent py-[19px] text-lg font-semibold text-on-fill
            transition-colors hover:bg-accent-dark active:bg-accent-dark
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
            aria-disabled:cursor-default aria-disabled:opacity-70 aria-disabled:hover:bg-accent"
        >
          {submitting && <Spinner />}
          <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
        </button>

      </div>

      {/* Message slot under the button: the credential error, or while a
          Turnstile token is pending, the status line. Fixed height, so
          neither coming or going moves the link below. */}
      <div className="relative flex min-h-[28px] flex-col items-center justify-center">
        <CredentialErrorMessage error={error} onDismiss={handleDismissError} />
        <p id="verify-status" role="status" className="text-center text-sm text-ink-light empty:hidden">
          {verifying && !submitting && !error ? 'Checking your connection is secure…' : ''}
        </p>
      </div>

      {inline && (
        <p className="text-center text-base text-ink-light">
          New here?{' '}
          <Link to="/signup" className={LINK_CLASS}>
            Create an account
          </Link>
        </p>
      )}
    </form>
  )
}
