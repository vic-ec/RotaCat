import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthHero from '../components/AuthHero'

// Which role the registrant is selecting at step 1
const ROLE_OPTIONS = [
  {
    value: 'doctor',
    label: 'Doctor / Clinical staff',
    description: 'EC Medical Officer, Registrar, Intern/COSMO, Consultant',
  },
  {
    value: 'locum',
    label: 'Locum',
    description: 'Apply for open shifts and view published roster',
  },
  {
    value: 'clerk',
    label: 'Clerk / Admin staff',
    description: 'Read-only access to roster and contact details',
  },
]

// Category options shown only when role = 'doctor'
const CATEGORY_OPTIONS = [
  { value: 'MO',          label: 'EC Medical Officer' },
  { value: 'Registrar',   label: 'Registrar' },
  { value: 'EC_COSMO',    label: 'EC Intern / COSMO' },
  { value: 'OT_COSMO',    label: 'OT Intern / COSMO' },
  { value: 'COSMO_Psych', label: 'OT Intern / COSMO (Psych)' },
  { value: 'Consultant',  label: 'Consultant' },
]

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
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
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
      <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-10">
        <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
          <AuthHero />
          <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-[4.375rem] md:px-[4.375rem] md:py-20">
            <div className="mx-auto w-full max-w-sm">
              <p className="text-2xl font-semibold text-ink lg:text-3xl">Create account</p>
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
              <p className="mt-6 text-center text-base text-ink-muted">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-rose hover:text-rose-dark hover:underline">
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
    <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">

        <AuthHero />

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-[4.375rem] md:px-[4.375rem] md:py-20">
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

            <p className="text-2xl font-semibold text-ink lg:text-3xl">
              {ROLE_OPTIONS.find(r => r.value === role)?.label}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">

              {/* Category selector — doctors only */}
              {role === 'doctor' && (
                <div>
                  <label htmlFor="category" className="mb-1.5 block text-base font-semibold text-ink">
                    Staff category
                  </label>
                  <select
                    id="category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
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

              <div>
                <label htmlFor="name" className="mb-1.5 block text-base font-semibold text-ink">
                  First name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-rose focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                />
              </div>

              <div>
                <label htmlFor="surname" className="mb-1.5 block text-base font-semibold text-ink">
                  Surname
                </label>
                <input
                  id="surname"
                  type="text"
                  required
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-rose focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                />
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-base font-semibold text-ink">
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
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-3 pl-12 pr-4
                      text-base text-ink placeholder:text-ink-muted
                      transition-colors focus:border-rose focus:bg-canvas-raised
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-base font-semibold text-ink">
                  Password
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
                    placeholder="At least 8 characters"
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised py-3 pl-12 pr-12
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

              {/* Locum agency — optional */}
              {role === 'locum' && (
                <div>
                  <label htmlFor="agency" className="mb-1.5 block text-base font-semibold text-ink">
                    Agency <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <input
                    id="agency"
                    type="text"
                    value={locumAgency}
                    onChange={(e) => setLocumAgency(e.target.value)}
                    placeholder="Agency name or 'Independent'"
                    className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
                      text-base text-ink placeholder:text-ink-muted
                      transition-colors focus:border-rose focus:bg-canvas-raised
                      focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
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
                className="mt-2 w-full rounded-lg bg-accent py-3.5 text-lg font-semibold text-white
                  transition-colors hover:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                  disabled:opacity-60"
              >
                {submitting ? 'Registering…' : 'Register'}
              </button>

              <p className="mt-4 text-center text-base text-ink-muted">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-rose hover:text-rose-dark hover:underline">
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
