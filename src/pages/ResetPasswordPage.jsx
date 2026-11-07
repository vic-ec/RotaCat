import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PASSWORD_HINT_SHORT, passwordProblem } from '../lib/passwordPolicy'
import { supabase } from '../lib/supabase'
import AuthHero from '../components/AuthHero'
import AuthFooter from '../components/AuthFooter'
import CapsLockNotice from '../components/CapsLockNotice'
import PasswordRequirementsInfo from '../components/PasswordRequirementsInfo'
import PasswordRevealToggle from '../components/PasswordRevealToggle'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'
import { authFieldClass, authButtonClass, AUTH_LABEL_LG, AUTH_BUTTON_OUTLINE, AUTH_PANEL, AUTH_ERROR, AUTH_HINT } from '../lib/authStyles'


export default function ResetPasswordPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  // Per field, not one shared flag — revealing the one you're checking
  // shouldn't expose the other.
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const capsLock = useCapsLockWarning()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const pwProblem = passwordProblem(password)
    if (pwProblem) {
      setError(pwProblem)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="auth-page flex min-h-dvh flex-col items-center justify-center px-4">
        <div className={`w-full max-w-sm p-8 text-center ${AUTH_PANEL}`}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg">
            <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-xl font-bold text-ink">Password updated</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Your password has been reset. You&apos;re signed in — continue to your account.
          </p>
          <button
            onClick={() => navigate('/')}
            className={`${AUTH_BUTTON_OUTLINE} mt-6`}
          >
            Continue
          </button>
        </div>
        <AuthFooter onSheen />
      </div>
    )
  }

  // Still resolving the recovery link from the URL
  if (loading) {
    return (
      <div className="auth-page flex min-h-dvh flex-col items-center justify-center px-4">
        <p className="text-sm text-auth-sheet-ink">Verifying your reset link…</p>
        <AuthFooter onSheen />
      </div>
    )
  }

  // No session — the link was invalid, expired, or already used
  if (!user) {
    return (
      <div className="auth-page flex min-h-dvh flex-col items-center justify-center px-4">
        <div className={`w-full max-w-sm p-8 text-center ${AUTH_PANEL}`}>
          <h2 className="font-display text-xl font-bold text-ink">Link expired</h2>
          <p className="mt-2 text-sm text-ink-muted">
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <Link
            to="/login?forgot=1"
            className={`${AUTH_BUTTON_OUTLINE} mt-6`}
          >
            Request a new link
          </Link>
        </div>
        <AuthFooter onSheen />
      </div>
    )
  }

  return (
    <div className="auth-page flex min-h-dvh flex-col items-center justify-center px-4 py-3 md:px-[4vw] md:py-[3.75vw]">
      {/* The login card: white halves, 1px seam, on the brushed page. */}
      <div className={`mx-auto flex w-full max-w-[1800px] flex-col overflow-hidden md:min-h-[720px] md:flex-row ${AUTH_PANEL} bg-auth-panel`}>
        <AuthHero seam="shell" />

        <div className="relative flex flex-1 flex-col justify-center px-6 py-8 md:px-10 md:py-16 lg:px-[4.375rem]">
          <div className="mx-auto w-full max-w-[456px]">
            <h2 className="text-center text-2xl font-semibold text-ink md:text-3xl">Set a new password</h2>
            <p className="mt-2 text-center text-sm text-ink-light md:text-base">Choose a new password for your account.</p>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 md:mt-8 md:gap-[22px]">
              <div>
                <label htmlFor="password" className={`${AUTH_LABEL_LG} flex items-center gap-1.5`}>
                  New password
                  <PasswordRequirementsInfo align="center" />
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={capsLock.onKeyDown}
                    onKeyUp={capsLock.onKeyUp}
                    placeholder="Enter new password"
                    className={authFieldClass({ trailing: true, large: true })}
                  />
                  <PasswordRevealToggle revealed={showPassword} onToggle={() => setShowPassword(v => !v)} controls="password" />
                </div>
                <p className={AUTH_HINT}>{PASSWORD_HINT_SHORT}</p>
              </div>

              <div>
                <label htmlFor="confirm" className={AUTH_LABEL_LG}>
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={capsLock.onKeyDown}
                    onKeyUp={capsLock.onKeyUp}
                    placeholder="Re-enter new password"
                    className={authFieldClass({ trailing: true, large: true })}
                  />
                  <PasswordRevealToggle revealed={showConfirm} onToggle={() => setShowConfirm(v => !v)} controls="confirm" />
                </div>
                <CapsLockNotice show={capsLock.capsOn} />
              </div>

              {error && (
                <div role="alert" className={AUTH_ERROR}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={authButtonClass({ large: true, extra: 'mt-2' })}
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>
          <div className="mt-8 md:absolute md:inset-x-0 md:bottom-6 md:mt-0">
            <AuthFooter onLight topGap="mt-0" />
          </div>
        </div>
      </div>
    </div>
  )
}
