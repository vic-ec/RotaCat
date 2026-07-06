import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthHero from '../components/AuthHero'

export default function SignupPage() {
  const { signUp } = useAuth()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    const { error } = await signUp(email, password, name, surname)
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    setSubmitted(true)
  }

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">

        <AuthHero />

        {/* Form panel */}
<div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-[4.375rem] md:px-[4.375rem] md:py-20">
  <div className="mx-auto w-full max-w-sm">
    <p className="text-2xl font-semibold text-ink lg:text-3xl">
      Register your account
    </p>

    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-5">
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
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-3
            text-base text-ink placeholder:text-ink-muted
            transition-colors focus:border-rose focus:bg-canvas-raised
            focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-base font-semibold text-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
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
    </form>
  </div>
</div>
