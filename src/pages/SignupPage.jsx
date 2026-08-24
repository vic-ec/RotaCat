import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PASSWORD_HINT_SHORT, passwordProblem } from '../lib/passwordPolicy'
import { isValidEmail } from '../lib/validateEmail'
import AuthHero from '../components/AuthHero'
import MobileAuthHero from '../components/MobileAuthHero'
import AuthFooter from '../components/AuthFooter'
import CapsLockNotice from '../components/CapsLockNotice'
import PasswordRevealToggle from '../components/PasswordRevealToggle'
// Left-anchored: the icon sits close to the sign-up sheet's left edge, so a
// centred tooltip would spill past it and get clipped.
import PasswordRequirementsInfo from '../components/PasswordRequirementsInfo'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'
import { formatPhoneProgressive } from '../lib/phone'
import TurnstileWidget, { TURNSTILE_ENABLED } from '../components/TurnstileWidget'


// Which role the registrant is selecting
const ROLE_OPTIONS = [
  {
    value: 'doctor',
    label: "Full-Time Doctor",
    description: 'A versatile account for contracted clinicians',
  },
  {
    value: 'locum',
    label: "Locum Doctor",
    description: 'A no-frills account for part-time clinicians',
  },
  {
    value: 'clerk',
    label: "Clerk",
    description: 'A basic account for read-only access',
  },
]

// Category options shown only when role = 'doctor'. COSMO deliberately
// excluded here (2026-08) — Intern is the one choice offered at signup for
// junior doctors now; COSMO still exists as a category (kept for possible
// future reuse) but is admin-assigned only, via Staff List / pending
// review, not self-selected at registration.
const CATEGORY_OPTIONS = [
  { value: 'MO',         label: 'Medical Officer' },
  { value: 'Registrar',  label: 'Registrar' },
  { value: 'Intern',     label: 'Intern' },
  { value: 'Consultant', label: 'Consultant' },
]


// Popup shown when a role card is picked — replaces the old full-page
// "step 2" so the base Create-account panel never changes height. The
// header and Register button stay fixed; only the field list between
// them scrolls, so the primary action is always reachable without
// hunting for it at the bottom of a tall form.
function RoleModal({ role, onClose }) {
  const { signUp, verifySignupOtp, resendSignupOtp } = useAuth()
  const navigate = useNavigate()
  const nameRef = useRef(null)
  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [locumAgency, setLocumAgency] = useState('')
  // Honeypot — invisible to a real visitor (off-screen, unreachable by tab,
  // hidden from assistive tech) but a plain-fill bot that populates every
  // <input> it finds will still write to it. A non-empty value on submit
  // means the "success"/OTP screen renders as normal (so the bot doesn't
  // learn to route around it) but signUp is never actually called, so no
  // Supabase Auth user or profile row gets created for it.
  const [honeypot, setHoneypot] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const capsLock = useCapsLockWarning()

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Return focus to whatever triggered the modal (the role card button)
  // once it closes, since that element is still the logical place for
  // keyboard/screen-reader focus to land.
  useEffect(() => {
    const trigger = document.activeElement
    return () => trigger?.focus?.()
  }, [])

  // Focus the first field imperatively, after mount, instead of the native
  // `autofocus` attribute — `autofocus` fires synchronously as the browser
  // is still laying out this freshly-mounted modal, which on mobile Safari
  // raced the focus-triggered zoom against that layout pass and showed up
  // as a select-then-immediately-deselect zoom flicker. Focusing from an
  // effect (after mount/paint) gives the zoom a settled layout to animate
  // into, same fix already used for the sign-in modal.
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const label = ROLE_OPTIONS.find(r => r.value === role)?.label
  const emailInvalid = emailTouched && email.length > 0 && !isValidEmail(email)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Bot caught the honeypot — pretend it worked (no error, same success
    // screen) without ever calling signUp, so nothing is created and the
    // bot has no signal to adapt to.
    if (honeypot) {
      setSubmitted(true)
      return
    }

    if (role === 'doctor' && !category) {
      setError('Please select your staff category.')
      return
    }
    const pwProblem = passwordProblem(password)
    if (pwProblem) {
      setError(pwProblem)
      return
    }
    if (TURNSTILE_ENABLED && !captchaToken) {
      setError('Please complete the verification check.')
      return
    }

    setSubmitting(true)
    const { error } = await signUp(email, password, name, surname, role, category || null, phone, captchaToken)
    setSubmitting(false)

    // A Turnstile token is single-use — reset the widget for a fresh one
    // regardless of outcome, otherwise a retry after a validation error
    // would submit the same already-consumed token.
    turnstileRef.current?.reset()
    setCaptchaToken('')

    if (error) {
      setError(error.message && error.message !== '{}' ? error.message : 'Something went wrong. Please try again.')
      return
    }
    setSubmitted(true)
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setOtpError('')
    setVerifying(true)
    const { error } = await verifySignupOtp(email, otp)
    setVerifying(false)

    if (error) {
      setOtpError(error.message && error.message !== '{}' ? error.message : 'Something went wrong. Please try again.')
      return
    }
    navigate('/')
  }

  async function handleResendOtp() {
    setResending(true)
    setResent(false)
    const { error } = await resendSignupOtp(email)
    setResending(false)
    if (!error) setResent(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm max-h-[90vh] flex-col overflow-hidden rounded-xl border border-slate-line bg-canvas-raised shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-accent/30 bg-accent-tint px-5 py-4">
          <p className="text-lg font-semibold text-ink">{label}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-accent-light hover:text-ink active:bg-accent-light active:text-ink"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="px-5 pb-6 pt-1 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-ink-muted">
              We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.
              Enter it below to confirm your address.
            </p>

            <form onSubmit={handleVerifyOtp} className="mt-4 text-left">
              <label htmlFor="otp" className="mb-1.5 block text-sm font-semibold text-ink">
                Confirmation code
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                  text-center text-lg tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:text-ink-muted
                  transition-colors focus:border-accent focus:bg-canvas-raised
                  focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
              />

              {otpError && (
                <div className="mt-2 rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
                  {otpError}
                </div>
              )}

              <button
                type="submit"
                disabled={verifying || otp.length !== 6}
                className="mt-4 w-full rounded-lg bg-accent py-3 text-base font-semibold text-white
                  transition-colors hover:bg-accent-dark active:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                  disabled:opacity-60"
              >
                {verifying ? 'Confirming…' : 'Confirm email'}
              </button>
            </form>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resending}
              className="mt-3 text-sm font-medium text-rose transition-colors hover:text-rose-dark hover:underline disabled:opacity-60"
            >
              {resending ? 'Resending…' : resent ? 'Code resent — check your email' : "Didn't get a code? Resend"}
            </button>

            <Link
              to="/login"
              className="mt-6 block text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <form
              id="role-details-form"
              onSubmit={handleSubmit}
              className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4"
            >
              {/* Honeypot — off-screen and unreachable by keyboard/AT, so a
                  human visitor never notices or fills it in; a plain-fill
                  bot that populates every field it finds still will. See
                  the honeypot state comment above for what happens if it's
                  non-empty on submit. */}
              <div className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-ink">
                  First name
                </label>
                <input
                  ref={nameRef}
                  id="name"
                  name="given-name"
                  type="text"
                  required
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-accent focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
                />
              </div>

              <div>
                <label htmlFor="surname" className="mb-1.5 block text-sm font-semibold text-ink">
                  Surname
                </label>
                <input
                  id="surname"
                  name="family-name"
                  type="text"
                  required
                  autoComplete="family-name"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-accent focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold text-ink">
                  Mobile
                </label>
                <input
                  id="phone"
                  name="tel"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="numeric"
                  value={formatPhoneProgressive(phone)}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-accent focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
                />
              </div>

              {/* Category selector — doctors only, placed after name/surname */}
              {role === 'doctor' && (
                <div>
                  <label htmlFor="category" className="mb-1.5 block text-sm font-semibold text-ink">
                    Staff category
                  </label>
                  <select
                    id="category"
                    name="category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                      text-base text-ink transition-colors
                      focus:border-accent focus:bg-canvas-raised
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
                  >
                    <option value="">Select category…</option>
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Locum agency — optional, placed after name/surname */}
              {role === 'locum' && (
                <div>
                  <label htmlFor="agency" className="mb-1.5 block text-sm font-semibold text-ink">
                    Agency <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <input
                    id="agency"
                    name="organization"
                    type="text"
                    autoComplete="organization"
                    value={locumAgency}
                    onChange={(e) => setLocumAgency(e.target.value)}
                    placeholder="Agency name"
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                      text-base text-ink placeholder:text-ink-muted
                      transition-colors focus:border-accent focus:bg-canvas-raised
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
                  />
                </div>
              )}

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
                        : 'border-accent/50 focus:border-accent focus:outline-accent/25'}`}
                  />
                </div>
                {emailInvalid && (
                  <p className="mt-1 text-xs text-flagRed">Enter a valid email address.</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
                  Password
                  <PasswordRequirementsInfo />
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 118 0v3" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    name="new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={capsLock.onKeyDown}
                    onKeyUp={capsLock.onKeyUp}
                    onBlur={capsLock.onBlur}
                    placeholder="Enter password"
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-2 pl-12 pr-12
                      text-base text-ink placeholder:text-ink-muted
                      transition-colors focus:border-accent focus:bg-canvas-raised
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25"
                  />
                  <PasswordRevealToggle revealed={showPassword} onToggle={() => setShowPassword((prev) => !prev)} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">{PASSWORD_HINT_SHORT}</p>
                <CapsLockNotice show={capsLock.capsOn} />
              </div>

              {TURNSTILE_ENABLED && (
                <div className="mt-1">
                  <TurnstileWidget ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
                  {error}
                </div>
              )}
            </form>

            <div className="shrink-0 border-t border-slate-line px-5 py-4">
              <button
                type="submit"
                form="role-details-form"
                disabled={submitting || (TURNSTILE_ENABLED && !captchaToken)}
                className="w-full rounded-lg bg-accent py-3 text-base font-semibold text-white
                  transition-colors hover:bg-accent-dark active:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                  disabled:opacity-60"
              >
                {submitting ? 'Registering…' : 'Register'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function SignupPage() {
  const [selectedRole, setSelectedRole] = useState(null)

  return (
    <>
      {/* Mobile: full-bleed hero + rounded bottom sheet, no outer background frame */}
      <div className="flex h-dvh flex-col bg-canvas-raised md:hidden">
        <MobileAuthHero />

        <div className="relative -mt-[28px] flex h-[44dvh] flex-none flex-col justify-center rounded-t-[28px] bg-accent-panel px-8 py-4">
          <p className="text-center text-2xl font-semibold text-ink">Create your account</p>
          <div className="mt-3 space-y-1">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedRole(opt.value)}
                className="w-full rounded-xl border-2 border-accent/50 bg-canvas p-2.5 text-center transition-colors hover:border-accent hover:bg-canvas-sunken active:border-accent active:bg-canvas-sunken"
              >
                <p className="text-sm font-semibold text-ink">{opt.label}</p>
                <p className="mt-0.5 text-xs text-ink-light">{opt.description}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-ink-light">
            Already have an account?{' '}
            <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
              Sign in
            </Link>
          </p>

          <AuthFooter onLight topGap="mt-4" compact />
        </div>
      </div>

      {/* Desktop: split-screen card, unchanged */}
      <div className="hidden min-h-screen flex-col items-center justify-center bg-accent px-4 py-10 md:flex">
        <div className="flex w-full max-w-[80rem] overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
          <AuthHero />

          <div className="flex flex-1 flex-col bg-accent-panel px-[4.375rem] py-[5.75rem]">
            <div className="flex flex-1 items-center justify-center">
              <div className="mx-auto w-full max-w-sm">
                <p className="text-center text-2xl font-semibold text-ink lg:text-3xl">Create your account</p>
                <div className="mt-8 space-y-3">
                  {ROLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedRole(opt.value)}
                      className="w-full rounded-xl border-2 border-accent/50 bg-canvas p-4 text-center transition-colors hover:border-accent hover:bg-canvas-sunken active:border-accent active:bg-canvas-sunken"
                    >
                      <p className="text-base font-semibold text-ink">{opt.label}</p>
                      <p className="mt-0.5 text-sm text-ink-light">{opt.description}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-center text-base text-ink-light">
                  Already have an account?{' '}
                  <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>

            {/* Copyright pinned to the panel's own bottom edge, matching
                the Login page's desktop panel. */}
            <AuthFooter onLight compact />
          </div>
        </div>
      </div>

      {selectedRole && (
        <RoleModal role={selectedRole} onClose={() => setSelectedRole(null)} />
      )}
    </>
  )
}
