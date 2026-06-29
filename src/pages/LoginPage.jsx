import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import lily from '../assets/lily.png'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error } = await signIn(email, password)

    setSubmitting(false)
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : error.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img
            src={lily}
            alt=""
            className="mx-auto h-32 w-auto select-none"
            draggable="false"
          />
        </div>

        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-medium text-ink">RotaCat</h1>
          <p className="mt-1.5 text-sm font-medium text-accent-dark">the smarter play in EC rostering</p>
          <p className="mt-3 text-sm text-ink-muted">Sign in to view the shift schedule</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="mb-4 rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium text-accent hover:text-accent-dark">
            Register here
          </Link>
        </p>
      </div>
    </div>
  )
}
