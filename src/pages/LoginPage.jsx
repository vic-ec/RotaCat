import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import lily from '../assets/lily-transparent.png'

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
    <div
      className="flex min-h-screen items-center justify-center bg-canvas px-4
        bg-[linear-gradient(theme(colors.slate.line)_1px,transparent_1px),linear-gradient(90deg,theme(colors.slate.line)_1px,transparent_1px)]
        bg-[length:44px_44px] bg-center"
    >
      <div className="w-full max-w-sm">
        <div className="rounded-lg border-t-[3px] border-accent bg-canvas-raised px-9 pb-8 pt-10 shadow-raised">

          {/* Brand header */}
          <div className="mb-1 text-center">
            <img
              src={lily}
              alt=""
              className="mx-auto mb-3 h-28 w-auto select-none"
              draggable="false"
            />
            <h1 className="font-display text-3xl font-medium leading-none text-ink">
              RotaCat
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              the smarter play in EC rostering
            </p>
          </div>

          <hr className="my-6 border-t border-slate-line" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-ink">
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
                className="w-full rounded border border-slate-line bg-canvas-sunken px-3.5 py-2.5
                  text-sm text-ink placeholder:text-ink-muted
                  transition-colors focus:border-rose focus:bg-canvas-raised
                  focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-ink">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border border-slate-line bg-canvas-sunken px-3.5 py-2.5
                  text-sm text-ink placeholder:text-ink-muted
                  transition-colors focus:border-rose focus:bg-canvas-raised
                  focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
              />
            </div>

            {error && (
              <div className="rounded bg-flagRed-bg px-3 py-2.5 text-sm text-flagRed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded bg-accent py-3 text-sm font-semibold text-white
                transition-colors hover:bg-accent-dark
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-muted">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-rose hover:text-rose-dark hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
