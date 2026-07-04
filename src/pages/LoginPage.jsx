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
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-canvas-raised shadow-raised md:flex-row">

        {/* Hero panel */}
        <div className="flex flex-col items-center justify-center bg-canvas-sunken px-8 py-10 md:w-1/2 md:border-r md:border-slate-line">
          <h1 className="font-display text-3xl font-medium leading-none text-ink">
            Rota<span className="text-accent">Cat</span>
          </h1>
          <p className="relative mt-1.5 text-sm text-ink-muted">
            the smarter play in EC rostering
            <Butterfly className="absolute -top-3 -right-1 h-3.5 w-3.5 -rotate-12" />
          </p>

          <img
            src={robotLily}
            alt=""
            className="mt-5 h-32 w-auto select-none md:h-36"
            draggable="false"
          />
        </div>

        {/* Form panel */}
        <div className="flex flex-1 flex-col justify-center px-8 py-10 md:px-10">
          <div className="mx-auto w-full max-w-xs">
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
    </div>
  )
}
