import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-sm text-center">
          <div className="card p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-xl text-ink">Registration received</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Check your email to confirm your address. Once confirmed, an admin will
              review and approve your account — you'll get a notification when it's active.
            </p>
            <Link to="/login" className="btn-secondary mt-6 inline-block">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-medium text-ink">Register</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Create your account — admin approval is required before you can sign in
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="name" className="label-text">First name</label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="surname" className="label-text">Surname</label>
              <input
                id="surname"
                type="text"
                required
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="email" className="label-text">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="label-text">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <div className="mb-4 rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:text-accent-dark">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
