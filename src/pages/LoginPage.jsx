import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import robotLily from '../assets/lily-robot-ginger.png'

function Butterfly({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 6c-1-3-6-4-7-1-1 2.5 1.5 4.5 4 4.5" stroke="#0E7C6B" strokeWidth="1.4" fill="#0E7C6B" fillOpacity="0.45" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 6c1-3 6-4 7-1 1 2.5-1.5 4.5-4 4.5" stroke="#D6577E" strokeWidth="1.4" fill="#D6577E" fillOpacity="0.45" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8c-1 2.5-5 3.5-5.5 1-.4-2 2-3.2 4-2.3" stroke="#0E7C6B" strokeWidth="1.2" fill="#0E7C6B" fillOpacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8c1 2.5 5 3.5 5.5 1 .4-2-2-3.2-4-2.3" stroke="#D6577E" strokeWidth="1.2" fill="#D6577E" fillOpacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="12" y1="5.5" x2="12" y2="13" stroke="#0F172A" strokeWidth="1.1" strokeLinecap="round"/>
    </svg>
  )
}

function RotaCat({ className }) {
  return (
    <span className={className}>
      Rota<span className="text-accent">Cat</span>
    </span>
  )
}

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
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-canvas-raised shadow-raised md:flex-row">

        {/* Hero panel */}
        <div className="flex flex-col items-center justify-center bg-canvas px-10 py-14 md:w-1/2 md:px-14 md:py-16">
          <h1 className="font-display text-5xl font-medium leading-none text-ink md:text-6xl">
            <RotaCat />
          </h1>
          <p className="relative mt-3 text-base text-ink-muted md:text-lg">
            the smarter play in EC rostering
            <Butterfly className="absolute -top-4 -right-2 h-5 w-5 -rotate-12" />
          </p>

          <img
            src={robotLily}
            alt=""
            className="mt-8 h-56 w-auto select-none md:h-64"
            draggable="false"
          />
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center bg-canvas-raised px-10 py-14 md:px-14 md:py-16">
          <div className="mx-auto w-full max-w-sm">
            <h2 className="text-2xl font-semibold text-ink">Welcome</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Sign in to your <RotaCat /> account
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">
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
                  className="w-full rounded-lg border border-slate-line bg-canvas-sunken px-4 py-3
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-rose focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose/25"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">
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
                  className="w-full rounded-lg border border-slate-line bg-canvas-sunken px-4 py-3
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

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-accent py-3.5 text-base font-semibold text-white
                  transition-colors hover:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                  disabled:opacity-60"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-muted">
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
