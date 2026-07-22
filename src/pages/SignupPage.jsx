import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthHero from '../components/AuthHero'
import MobileAuthHero from '../components/MobileAuthHero'
import AuthFooter from '../components/AuthFooter'

// Password rule: 8+ chars, at least one lower, one upper, one digit, one symbol
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'

// Which role the registrant is selecting
const ROLE_OPTIONS = [
  {
    value: 'doctor',
    label: "I'm a Doctor",
    description: 'A versatile account for contracted clinicians',
  },
  {
    value: 'locum',
    label: "I'm a Locum Doctor",
    description: 'A no-frills account for part-time clinicians',
  },
  {
    value: 'clerk',
    label: "I'm a Clerk",
    description: 'A basic account for read-only access',
  },
]

// Category options shown only when role = 'doctor'
const CATEGORY_OPTIONS = [
  { value: 'MO',         label: 'Medical Officer' },
  { value: 'Registrar',  label: 'Registrar' },
  { value: 'COSMO',      label: 'COSMO' },
  { value: 'Intern',     label: 'Intern' },
  { value: 'Consultant', label: 'Consultant' },
]

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

// Registration form for one role — rendered inside the RoleModal popup.
// Kept as one compact size regardless of breakpoint since it now always
// lives in a fixed-width dialog rather than a full split-screen panel.
function RoleDetailsForm({ role }) {
  const { signUp } = useAuth()
  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [locumAgency, setLocumAgency] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (role === 'doctor' && !category) {
      setError('Please select your staff category.')
      return
    }
    if (!PASSWORD_RULE.test(password)) {
      setError(`Password doesn’t meet the requirements. ${PASSWORD_HINT}`)
      return
    }

    setSubmitting(true)
    const { error } = await signUp(email, password, name, surname, role, category || null)
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="pt-2 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
          <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-display text-xl text-ink">Registration received</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Check your email to confirm your address. Once confirmed, an admin will
          review and approve your account. You will get a notification when your account is active.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-lg border border-accent bg-accent-tint px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-light"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-ink">
          First name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
            text-base text-ink placeholder:text-ink-muted
            transition-colors focus:border-rose focus:bg-canvas-raised
            focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
        />
      </div>

      <div>
        <label htmlFor="surname" className="mb-1.5 block text-sm font-semibold text-ink">
          Surname
        </label>
        <input
          id="surname"
          type="text"
          required
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
            text-base text-ink placeholder:text-ink-muted
            transition-colors focus:border-rose focus:bg-canvas-raised
            focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
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
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
              text-base text-ink transition-colors
              focus:border-rose focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
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
            type="text"
            value={locumAgency}
            onChange={(e) => setLocumAgency(e.target.value)}
            placeholder="Agency name"
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:border-rose focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
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
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-2 pl-12 pr-4
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:border-rose focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
          />
        </div>
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
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-2 pl-12 pr-12
              text-base text-ink placeholder:text-ink-muted
              transition-colors focus:border-rose focus:bg-canvas-raised
              focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-4 flex items-center text-ink-muted transition-colors hover:text-ink"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0112 20C7 20 2.73 16.89 1 12c.73-2.06 2-3.85 3.6-5.22" />
                <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                <path d="M1 1l22 22" />
                <path d="M9.88 4.24A10.94 10.94 0 0112 4c5 0 9.27 3.11 11 8a11.83 11.83 0 01-4.24 5.18" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          disabled:opacity-60"
      >
        {submitting ? 'Registering…' : 'Register'}
      </button>
    </form>
  )
}

// Popup shown when a role card is picked — replaces the old full-page
// "step 2" so the base Create-account panel never changes height.
function RoleModal({ role, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const label = ROLE_OPTIONS.find(r => r.value === role)?.label

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[90vh] w-full max-w-sm overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-ink">{label}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <RoleDetailsForm role={role} />
      </div>
    </div>
  )
}

export default function SignupPage() {
  const [selectedRole, setSelectedRole] = useState(null)

  return (
    <>
      {/* Mobile: full-bleed hero + rounded bottom sheet, no outer background frame */}
      <div className="flex h-screen flex-col bg-canvas-raised md:hidden">
        <MobileAuthHero />

        <div className="relative -mt-[28px] flex min-h-[34vh] flex-none flex-col justify-center rounded-t-[28px] bg-accent-light px-8 py-4">
          <p className="text-center text-2xl font-semibold text-ink">Create your account</p>
          <div className="mt-3 space-y-1">
            {ROLE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedRole(opt.value)}
                className="w-full rounded-xl border-2 border-accent/50 bg-canvas-raised p-2.5 text-center transition-colors hover:border-accent hover:bg-accent-tint"
              >
                <p className="text-sm font-semibold text-ink">{opt.label}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{opt.description}</p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-ink-muted">
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

          <div className="flex flex-1 flex-col justify-center bg-accent-light px-[4.375rem] py-20">
            <div className="mx-auto w-full max-w-sm">
              <p className="text-2xl font-semibold text-ink lg:text-3xl">Create your account</p>
              <div className="mt-8 space-y-3">
                {ROLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedRole(opt.value)}
                    className="w-full rounded-xl border-2 border-accent/50 bg-canvas-raised p-4 text-left transition-colors hover:border-accent hover:bg-accent-tint"
                  >
                    <p className="text-base font-semibold text-ink">{opt.label}</p>
                    <p className="mt-0.5 text-sm text-ink-muted">{opt.description}</p>
                  </button>
                ))}
              </div>
              <p className="mt-6 text-center text-base text-ink-muted">
                Already have an account?{' '}
                <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>

        <AuthFooter compact />
      </div>

      {selectedRole && (
        <RoleModal role={selectedRole} onClose={() => setSelectedRole(null)} />
      )}
    </>
  )
}
