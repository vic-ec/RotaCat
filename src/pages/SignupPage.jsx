import { useRef, useState } from 'react'
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
import DateFieldButton from '../components/DateFieldButton'
import AuthModal from '../components/AuthModal'
import AuthField from '../components/AuthField'
import ConfirmEmailForm from '../components/ConfirmEmailForm'
import TurnstileSlot from '../components/TurnstileSlot'
import { authButtonClass, AUTH_LINK, AUTH_LINK_MUTED, AUTH_ERROR, AUTH_MODAL } from '../lib/authStyles'
import { TURNSTILE_ENABLED } from '../components/TurnstileWidget'

// See LoginPage: React 18 forwards `inert` only as a string attribute.
const inertWhen = (condition) => (condition ? { inert: '' } : {})


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
// "step 2" so the base Create-account panel never changes height. Built on
// the shared AuthModal shell (fixed header and Register footer, only the
// field list between them scrolls) and AuthField, the same two pieces as
// the Reset-password dialog, so the four auth dialogs share one look.
const MODAL_TITLES = {
  doctor: 'Create a full-time doctor account',
  locum: 'Create a locum doctor account',
  clerk: 'Create a clerk account',
}
// Fixed-term placements: the roster cannot plan around these doctors
// without knowing when they start and finish, so the dates are required.
const PERIOD_REQUIRED_CATEGORIES = new Set(['Intern', 'Registrar'])


function RoleModal({ role, onClose }) {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const nameRef = useRef(null)
  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [locumAgency, setLocumAgency] = useState('')
  // A doctor's activity period — the dates they are eligible for shifts.
  // Required for the fixed-term categories (Intern, Registrar), optional
  // for the permanent ones; never asked of a locum or clerk.
  const [activeFrom, setActiveFrom] = useState('')
  const [activeUntil, setActiveUntil] = useState('')
  const asksPeriod = role === 'doctor'
  const periodRequired = asksPeriod && PERIOD_REQUIRED_CATEGORIES.has(category)
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
  const capsLock = useCapsLockWarning()

  const emailInvalid = emailTouched && email.length > 0 && !isValidEmail(email)
  // Tracks the confirm field keystroke by keystroke, as the set-password
  // page does: a mismatch is flagged as soon as something is typed there,
  // and a match is confirmed so nobody has to squint at two rows of dots.
  const mismatch = confirm.length > 0 && password !== confirm
  const matches = confirm.length > 0 && password === confirm

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
    if (periodRequired && (!activeFrom || !activeUntil)) {
      setError('Please enter the start and end dates of your placement.')
      return
    }
    if (activeFrom && activeUntil && activeUntil < activeFrom) {
      setError('Your end date must be on or after your start date.')
      return
    }
    const pwProblem = passwordProblem(password)
    if (pwProblem) {
      setError(pwProblem)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (TURNSTILE_ENABLED && !captchaToken) {
      setError('Please complete the verification check.')
      return
    }

    setSubmitting(true)
    const { error } = await signUp(
      email, password, name, surname, role, category || null, phone, captchaToken,
      asksPeriod ? { activeFrom, activeUntil } : {},
    )
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

  const title = MODAL_TITLES[role]
  const dateOrderInvalid = Boolean(activeFrom && activeUntil && activeUntil < activeFrom)
  const periodDescribedBy = `${dateOrderInvalid ? 'activity-period-error ' : ''}activity-period-hint`

  return (
    <AuthModal
      size="medium"
      title={submitted ? 'Check your email' : title}
      titleId="role-modal-title"
      onClose={onClose}
      initialFocusRef={nameRef}
      footer={submitted ? null : (
        <>
          <button
            type="submit"
            form="role-details-form"
            disabled={submitting || (TURNSTILE_ENABLED && !captchaToken)}
            className={authButtonClass({ large: false })}
          >
            {submitting ? 'Registering…' : 'Register'}
          </button>
          <p className="mt-3 text-center text-sm text-ink-light">
            Already have an account?{' '}
            <Link to="/login" className={AUTH_LINK}>Sign in</Link>
          </p>
        </>
      )}
    >
      {submitted ? (
        <ConfirmEmailForm email={email} onConfirmed={() => navigate('/')} />
      ) : (
        <form id="role-details-form" onSubmit={handleSubmit}>
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

          {/* One column on a phone; two from 640px — First | Surname,
              Email | Mobile, then the full-width groups. */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${AUTH_MODAL.groupGap}`}>
            <AuthField
              ref={nameRef}
              id="name"
              label="First name"
              name="given-name"
              type="text"
              required
              autoComplete="given-name"
              placeholder="First name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <AuthField
              id="surname"
              label="Surname"
              name="family-name"
              type="text"
              required
              autoComplete="family-name"
              placeholder="Surname"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
            />

            <AuthField
              id="email"
              label="Email"
              icon="mail"
              span="full"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="Your email"
              error={emailInvalid ? 'Enter a valid email address.' : undefined}
            />

            {/* Mobile shares its row with the role's own field (staff
                category / agency); a clerk has neither, so it runs full. */}
            <AuthField
              id="phone"
              label="Mobile"
              icon="phone"
              span={role === 'clerk' ? 'full' : undefined}
              name="tel"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              placeholder="Mobile number"
              value={formatPhoneProgressive(phone)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />

            {/* Category selector — doctors only */}
            {role === 'doctor' && (
              <AuthField
                as="select"
                id="category"
                label="Staff category"
                name="category"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select category…</option>
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </AuthField>
            )}

            {/* Activity period — doctors only. What the roster uses to
                decide when this person can be given shifts, so it is
                asked for here rather than left for an admin to guess.
                The app's shared date field in its auth size, two equal
                columns; an end date before the start is flagged inline
                as soon as both are picked. */}
            {asksPeriod && (
              <fieldset className="sm:col-span-2">
                <legend className={AUTH_MODAL.label}>
                  Activity period{periodRequired ? '' : <span className="font-normal text-ink-muted"> (optional)</span>}
                </legend>
                {/* Side by side from 360px; a 320px phone stacks them,
                    where two columns truncate "Start date" to "Sta…". */}
                <div className={`grid grid-cols-1 min-[360px]:grid-cols-2 ${AUTH_MODAL.groupGap}`}>
                  <DateFieldButton
                    id="active-from" label="From" variant="auth" fullWidth
                    required={periodRequired} value={activeFrom} onChange={setActiveFrom}
                    ariaDescribedBy="activity-period-hint"
                  />
                  <DateFieldButton
                    id="active-until" label="To" variant="auth" fullWidth
                    required={periodRequired} min={activeFrom || undefined} value={activeUntil} onChange={setActiveUntil}
                    invalid={dateOrderInvalid} ariaDescribedBy={periodDescribedBy}
                  />
                </div>
                {dateOrderInvalid && (
                  <p id="activity-period-error" className={AUTH_MODAL.fieldError}>
                    End date must be on or after the start date.
                  </p>
                )}
                <p id="activity-period-hint" className={AUTH_MODAL.hint}>
                  {periodRequired
                    ? 'Required for this post. You’ll only be rostered within these dates.'
                    : 'Only needed for fixed-term posts. You’ll only be rostered within these dates. Leave blank if permanent.'}
                </p>
              </fieldset>
            )}

            {/* Locum agency — optional */}
            {role === 'locum' && (
              <AuthField
                id="agency"
                label="Agency"
                optional
                name="organization"
                type="text"
                autoComplete="organization"
                value={locumAgency}
                onChange={(e) => setLocumAgency(e.target.value)}
                placeholder="Agency name"
              />
            )}

            <AuthField
              id="password"
              label="Password"
              labelExtra={<PasswordRequirementsInfo />}
              icon="lock"
              span="full"
              name="new-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={capsLock.onKeyDown}
              onKeyUp={capsLock.onKeyUp}
              placeholder="Enter password"
              hint={PASSWORD_HINT_SHORT}
              trailing={<PasswordRevealToggle revealed={showPassword} onToggle={() => setShowPassword((prev) => !prev)} controls="password" />}
            />

            <AuthField
              id="confirm"
              label="Confirm password"
              icon="lock"
              span="full"
              name="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={capsLock.onKeyDown}
              onKeyUp={capsLock.onKeyUp}
              placeholder="Re-enter password"
              error={mismatch ? 'Passwords do not match.' : undefined}
              hint={matches ? 'Passwords match.' : undefined}
              trailing={<PasswordRevealToggle revealed={showConfirm} onToggle={() => setShowConfirm((prev) => !prev)} controls="confirm" />}
              after={<CapsLockNotice show={capsLock.capsOn} />}
            />
          </div>

          {/* Last in the form; holds no space unless Cloudflare needs the
              visitor to do something. */}
          <TurnstileSlot ref={turnstileRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />

          {error && (
            <div role="alert" className={`mt-4 ${AUTH_ERROR}`}>
              {error}
            </div>
          )}
        </form>
      )}
    </AuthModal>
  )
}

export default function SignupPage() {
  const [selectedRole, setSelectedRole] = useState(null)

  return (
    <>
      {/* Mobile: full-bleed hero + rounded bottom sheet, no outer background frame */}
      <div className="flex h-dvh flex-col bg-auth-hero md:hidden" {...inertWhen(Boolean(selectedRole))}>
        <MobileAuthHero />

        {/* Same sheen sheet as the login page's phone landing; the white
            role cards sit on it as they did on the mint. */}
        <div className="auth-page relative -mt-[28px] flex h-[44dvh] flex-none flex-col justify-center rounded-t-[28px] px-8 py-4">
          <h2 className="text-center text-2xl font-semibold text-auth-sheet-ink">Create your account</h2>
          <div className="mt-3 space-y-1">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedRole(opt.value)}
                className="btn-bevel-outline btn-face-card w-full rounded-[14px] border-2 border-accent/70 bg-auth-card p-2.5 text-center transition-colors hover:border-accent hover:bg-accent-night active:border-accent active:bg-accent-night"
              >
                <p className="text-sm font-semibold text-ink">{opt.label}</p>
                <p className="mt-0.5 text-xs text-ink-light">{opt.description}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-auth-sheet-ink-light">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-auth-sheet-link underline decoration-auth-sheet-link/45 underline-offset-4 transition-colors hover:text-auth-sheet-ink hover:decoration-auth-sheet-ink">
              Sign in
            </Link>
          </p>

          <AuthFooter onSheen topGap="mt-4" compact />
        </div>
      </div>

      {/* Desktop: the same shell as the login page — one raised white card
          on the deep page, two flush white halves and a 1px seam —
          with a 456px column in the right half, so the two pages share one
          width, height and type scale. */}
      <div className="auth-page hidden min-h-dvh flex-col items-center justify-center px-[4vw] py-[3.75vw] md:flex" {...inertWhen(Boolean(selectedRole))}>
        {/* min-h matches the login shell's, so the two cards are always the
            same height — see LoginPage. */}
        <div className="mx-auto flex min-h-[720px] w-full max-w-[1800px] overflow-hidden rounded-[24px] border border-auth-shell-border bg-auth-panel shadow-auth-shell md:flex-row">
          <AuthHero seam="shell" />

          {/* py-16 with the footer pinned inside the bottom band, so the
              content centres on the whole half — same as the login page. */}
          <div className="relative flex flex-1 flex-col bg-auth-panel px-10 py-16 lg:px-[4.375rem]">
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-[456px] text-center">
                <h2 className="text-3xl font-semibold text-ink lg:text-4xl">Create your account</h2>
                <p className="mt-3 text-[18.9px] text-ink-light lg:text-[23.1px]">Choose the account that fits your role</p>
                {/* Cards share the login fields' width, 14px radius and
                    accent/70 outline; the label is set like the Sign in
                    button's text and the description like the body copy.
                    The fill is a lighter mint than the page (auth-card,
                    Mint 1) and hover/press go to accent-night, so a card
                    darkens under the pointer rather than lifting.
                    Both tokens have dark-theme values, where the same
                    "deepen on hover" rule holds. */}
                <div className="mt-8 space-y-[22px]">
                  {ROLE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedRole(opt.value)}
                      className="btn-bevel-outline btn-face-card w-full rounded-[14px] border-2 border-accent/70 bg-auth-card px-4 py-4 text-center transition-colors hover:border-accent hover:bg-accent-night active:border-accent active:bg-accent-night"
                    >
                      <p className="text-lg font-semibold text-ink">{opt.label}</p>
                      <p className="mt-0.5 text-base text-ink-light">{opt.description}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-8 text-center text-base text-ink-light">
                  Already have an account?{' '}
                  <Link to="/login" className="font-medium text-accent underline decoration-accent/45 underline-offset-4 transition-colors hover:text-accent-dark hover:decoration-accent-dark">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>

            {/* Copyright pinned to the panel's own bottom edge, matching
                the Login page's desktop panel. */}
            <div className="absolute inset-x-0 bottom-6">
              <AuthFooter onLight topGap="mt-0" />
            </div>
          </div>
        </div>
      </div>

      {selectedRole && (
        <RoleModal role={selectedRole} onClose={() => setSelectedRole(null)} />
      )}
    </>
  )
}
