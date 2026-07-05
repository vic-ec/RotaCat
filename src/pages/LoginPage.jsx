import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthHero from '../components/AuthHero'

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
    <div className="flex min-h-screen items-center justify-center bg-accent px-4 py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
        <AuthHero />

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-[4.375rem] md:px-[4.375rem] md:py-20">
          <div className="mx-auto w-full max-w-sm">
            <p className="text-2xl font-semibold text-ink lg:text-3xl">
              Sign in to your account
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
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
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas px-4 py-3
                    text-lg text-ink placeholder:text-ink-muted
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas px-4 py-3
                    text-lg text-ink placeholder:text-ink-muted
                    transition-colors focus:border-rose focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                />
              </div>

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
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-base text-ink-muted">
              Don't have an account?{' '}
              <Link to="/signup" className="font-semibold text-rose hover:text-rose-dark hover:underline">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
