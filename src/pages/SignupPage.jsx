import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthHero from '../components/AuthHero'

// Password rule: 8+ chars, at least one lower, one upper, one digit, one symbol
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.'

// Which role the registrant is selecting at step 1
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

export default function SignupPage() {
  const { signUp } = useAuth()

  // Step 1: pick a role. Step 2: fill in details.
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [category, setCategory] = useState('')

  // Form fields (step 2)
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [locumAgency, setLocumAgency] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function handleRoleSelect(selectedRole) {
    setRole(selectedRole)
    setCategory('')
    setError('')
    setStep(2)
  }

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

  // ── Confirmation screen (same design as original) ──────────
  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent px-4">
        <div className="w-full max-w-sm rounded-xl border border-accent/50 bg-canvas-raised p-8 text-center shadow-raised">
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
      </div>
    )
  }

  // ── Step 1: Role selection ─────────────────────────────────
  if (step === 1) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-3 md:py-10">
        <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
          <AuthHero />
          <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-5 md:px-[4.375rem] md:py-20">
            <div className="mx-auto w-full max-w-sm">
              <p className="text-base font-semibold text-ink md:text-2xl lg:text-3xl">Create account</p>
              <p className="mt-2 text-sm text-ink-muted">What best describes you?</p>
              <div className="mt-8 space-y-3">
                {ROLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleRoleSelect(opt.value)}
                    className="w-full rounded-xl border-2 border-accent/50 bg-canvas-raised p-4 text-left transition-colors hover:border-accent hover:bg-accent-tint"
                  >
                    <p className="text-sm font-semibold text-ink">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{opt.description}</p>
                  </button>
                ))}
              </div>
              <p className="mt-6 text-center text-xs text-ink-muted md:text-base">
                Already have an account?{' '}
                <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 2: Details form (same layout/styling as original) ─
  return (
    <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-3 md:py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">

        <AuthHero />

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-5 md:px-[4.375rem] md:py-20">
          <div className="mx-auto w-full max-w-sm">

            <button
              onClick={() => setStep(1)}
              className="mb-5 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Change account type
            </button>

            <p className="text-base font-semibold text-ink md:text-2xl lg:text-3xl">
              {ROLE_OPTIONS.find(r => r.value === role)?.label}
            </p>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 md:mt-8 md:gap-5">

              {/* Category selector — doctors only */}
              {role === 'doctor' && (
                <div>
                  <label htmlFor="category" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
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
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
                      md:py-3"
                  >
                    <option value="">Select category…</option>
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
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
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
                    md:py-3"
                />
              </div>

              <div>
                <label htmlFor="surname" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
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
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
                    md:py-3"
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
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
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
                      md:py-3"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink md:text-base">
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
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
                      md:py-3"
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

              {/* Locum agency — optional */}
              {role === 'locum' && (
                <div>
                  <label htmlFor="agency" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
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
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25
                      md:py-3"
                  />
                </div>
              )}

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
                  disabled:opacity-60
                  md:py-3.5 md:text-lg"
              >
                {submitting ? 'Registering…' : 'Register'}
              </button>

              <p className="mt-4 text-center text-xs text-ink-muted md:text-base">
                Already have an account?{' '}
                <Link to="/login" className="text-rose hover:text-rose-dark hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
