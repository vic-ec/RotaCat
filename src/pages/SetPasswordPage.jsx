import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { PASSWORD_HINT, PASSWORD_HINT_SHORT, passwordProblem } from '../lib/passwordPolicy'
import AuthHero from '../components/AuthHero'
import AuthFooter from '../components/AuthFooter'
import CapsLockNotice from '../components/CapsLockNotice'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'

// Mandatory first-login password change for anyone still signed in with a
// password an admin generated for them (profiles.must_change_password).
//
// Not dismissable and not skippable: ProtectedRoute bounces every
// authenticated route back here while the flag is set, and this page has
// no "later" affordance. Signing out is the one way past it, which isn't a
// bypass — it ends the session rather than granting access with a
// credential someone else knows.
//
// Clearing the flag touches must_change_password and nothing else.
// is_approved is deliberately left alone: it was settled when an admin
// created the account, and replacing a password is a credential change,
// not a re-vetting of who this person is.
export default function SetPasswordPage() {
  const { profile, mustChangePassword, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const capsLock = useCapsLockWarning()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) {
      setSubmitting(false)
      setError(authError.message)
      return
    }

    // Only after the password itself actually changed — clearing the flag
    // first would leave someone still on the admin-issued password with
    // the gate lifted if this write failed.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', profile.id)
    setSubmitting(false)

    if (profileError) {
      setError(
        'Your password was changed, but we couldn’t record it. Sign out and back in with your new ' +
        'password — if this screen appears again, contact your roster administrator.'
      )
      return
    }

    await refreshProfile()
    navigate('/', { replace: true })
  }

  // Reached with the flag already cleared (a stale tab, a manual URL) —
  // there is nothing to do here.
  if (!mustChangePassword) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-accent px-4 py-3 md:py-10">
      <div className="flex w-full max-w-[80rem] flex-col overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
        <AuthHero />

        <div className="flex flex-1 flex-col justify-center bg-accent-light px-[3.125rem] py-5 md:px-[4.375rem] md:py-[5.75rem]">
          <div className="mx-auto w-full max-w-sm">
            <p className="text-base font-semibold text-ink md:text-2xl lg:text-3xl">Set your password</p>
            <p className="mt-2 text-sm text-ink-muted">
              {profile?.name ? `Welcome, ${profile.name}. ` : ''}
              You&apos;re signed in with a password an administrator generated for you. Choose your own
              to carry on.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 md:mt-8 md:gap-5">
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={capsLock.onKeyDown}
                  onKeyUp={capsLock.onKeyUp}
                  onBlur={capsLock.onBlur}
                  placeholder="Enter new password"
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-accent focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25
                    md:py-3"
                />
                <p className="mt-1 text-xs text-ink-muted">{PASSWORD_HINT_SHORT}</p>
              </div>

              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={capsLock.onKeyDown}
                  onKeyUp={capsLock.onKeyUp}
                  onBlur={capsLock.onBlur}
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
                    text-base text-ink placeholder:text-ink-muted
                    transition-colors focus:border-accent focus:bg-canvas-raised
                    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25
                    md:py-3"
                />
                <CapsLockNotice show={capsLock.capsOn} />
              </div>

              <p className="text-xs text-ink-muted">{PASSWORD_HINT}</p>

              {error && (
                <div className="rounded-lg bg-flagRed-bg px-4 py-3 text-sm text-flagRed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-accent py-3 text-base font-semibold text-white
                  transition-colors hover:bg-accent-dark active:bg-accent-dark
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose
                  disabled:opacity-60
                  md:py-3.5 md:text-lg"
              >
                {submitting ? 'Saving…' : 'Save password and continue'}
              </button>

              {/* Not an escape hatch from the requirement — it ends the
                  session rather than getting past it. */}
              <button
                type="button"
                onClick={signOut}
                className="mt-1 text-sm font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Sign out instead
              </button>
            </form>
          </div>
        </div>
      </div>

      <AuthFooter />
    </div>
  )
}
