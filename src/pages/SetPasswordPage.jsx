import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { passwordProblem } from '../lib/passwordPolicy'
import AuthHero from '../components/AuthHero'
import MobileAuthHero from '../components/MobileAuthHero'
import AuthFooter from '../components/AuthFooter'
import CapsLockNotice from '../components/CapsLockNotice'
import PasswordRequirementsInfo from '../components/PasswordRequirementsInfo'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'
import { useIsDesktop } from '../lib/useIsDesktop'

// Mandatory first-sign-in password change for anyone still using a password
// an admin generated for them (profiles.must_change_password).
//
// Not dismissable and not skippable: ProtectedRoute bounces every
// authenticated route back here while the flag is set, and this page has no
// "later" affordance. Signing out is the one way past it, which isn't a
// bypass — it ends the session rather than granting access with a credential
// someone else knows.
//
// Clearing the flag touches must_change_password and nothing else.
// is_approved is deliberately left alone: it was settled when an admin
// created the account, and replacing a password is a credential change, not
// a re-vetting of who this person is.
//
// Layout mirrors LoginPage exactly — full-bleed MobileAuthHero above a
// rounded bottom sheet below `md`, the split-screen AuthHero card above it —
// rather than using the desktop card at every width. This is the first
// screen a new doctor ever sees, arrived at from the emailed login link on a
// phone, so it has to look like the app's own sign-in rather than a
// desktop layout squeezed onto a phone.

// Shared by both breakpoints — the two layouts differ only in their frame.
function SetPasswordForm({ profile, onDone }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const capsLock = useCapsLockWarning()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!current) {
      setError('Enter the temporary password from your welcome email.')
      return
    }
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password === current) {
      setError('Choose a password different from the temporary one.')
      return
    }

    setSubmitting(true)
    // current_password is required by this project's Supabase Auth "Require
    // current password when updating" setting — without it the update is
    // rejected outright with "Current password required when setting new
    // password", which is exactly what this screen hit before the field
    // existed. Same call shape AccountSettingsPage's change-password uses.
    //
    // Deliberately no `email` alongside it: that would start an email change
    // and fire "Secure email change" confirmations to both addresses.
    const { error: authError } = await supabase.auth.updateUser({
      current_password: current,
      password,
    })
    if (authError) {
      setSubmitting(false)
      // The one predictable failure here is a mistyped temporary password;
      // GoTrue's own wording for it names a field this form doesn't label
      // that way, so it's translated rather than passed through raw.
      setError(
        /current password|invalid|credentials/i.test(authError.message)
          ? 'That temporary password is incorrect. Check the welcome email and try again.'
          : authError.message
      )
      return
    }

    // Only after the password itself actually changed — clearing the flag
    // first would leave someone still on the admin-issued password with the
    // gate lifted if this write failed.
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

    await onDone()
  }

  const fieldClass = `w-full rounded-lg border-2 border-accent/50 bg-canvas-raised px-4 py-2
    text-base text-ink placeholder:text-ink-muted
    transition-colors focus:border-accent focus:bg-canvas-raised
    focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent/25
    md:py-3 md:text-lg`

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 md:mt-8 md:gap-5">
      <div>
        <label htmlFor="current-password" className="mb-1.5 block text-sm font-semibold text-ink md:text-base">
          Temporary password
        </label>
        <input
          id="current-password"
          name="current-password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          onKeyDown={capsLock.onKeyDown}
          onKeyUp={capsLock.onKeyUp}
          onBlur={capsLock.onBlur}
          placeholder="From your welcome email"
          className={fieldClass}
        />
      </div>

      <div>
        {/* The icon sits beside the label rather than inside it — a
            tooltip nested in the <label> becomes part of the input's
            accessible name, so a screen reader would read the whole
            requirements sentence out as the field's name. */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <label htmlFor="password" className="block text-sm font-semibold text-ink md:text-base">
            New password
          </label>
          <PasswordRequirementsInfo />
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={capsLock.onKeyDown}
          onKeyUp={capsLock.onKeyUp}
          onBlur={capsLock.onBlur}
          placeholder="Enter new password"
          className={fieldClass}
        />
      </div>

      <div>
        {/* The icon sits beside the label rather than inside it — a
            tooltip nested in the <label> becomes part of the input's
            accessible name, so a screen reader would read the whole
            requirements sentence out as the field's name. */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <label htmlFor="confirm" className="block text-sm font-semibold text-ink md:text-base">
            Confirm password
          </label>
          <PasswordRequirementsInfo />
        </div>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={capsLock.onKeyDown}
          onKeyUp={capsLock.onKeyUp}
          onBlur={capsLock.onBlur}
          placeholder="Re-enter new password"
          className={fieldClass}
        />
        <CapsLockNotice show={capsLock.capsOn} />
      </div>

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
    </form>
  )
}

export default function SetPasswordPage() {
  const { profile, mustChangePassword, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  // One layout at a time rather than two CSS-hidden copies: this page's
  // fields carry ids and an autoFocus, and a duplicated form would mean
  // duplicate ids, two elements answering to the same label, and the
  // hidden copy stealing focus. Matches `md` (768px), the breakpoint the
  // Tailwind classes below use.
  const isDesktop = useIsDesktop(768)

  async function handleDone() {
    await refreshProfile()
    navigate('/', { replace: true })
  }

  // Reached with the flag already cleared (a stale tab, a manual URL) —
  // there is nothing to do here.
  if (!mustChangePassword) return <Navigate to="/" replace />

  const heading = 'Set your password'
  const intro = `Welcome to RotaCat${profile?.name ? `, ${profile.name}` : ''}. Please set a new password to continue.`

  // Ends the session rather than getting past the requirement — rose, the
  // app's own colour for the secondary link on an auth screen ("Create an
  // account", "Back to sign in").
  const signOutLink = (
    <button
      type="button"
      onClick={signOut}
      className="mt-4 block w-full text-center text-[14.7px] font-medium text-rose transition-colors hover:text-rose-dark hover:underline"
    >
      Sign out instead
    </button>
  )

  const form = <SetPasswordForm profile={profile} onDone={handleDone} />

  // Mobile: full-bleed hero above a rounded bottom sheet, no outer teal
  // frame — the same shape as LoginPage's mobile landing, which is where
  // the emailed login link lands people first.
  if (!isDesktop) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas-raised">
        <MobileAuthHero />

        <div className="relative -mt-[28px] flex flex-none flex-col justify-center rounded-t-[28px] bg-accent-panel px-8 pb-5 pt-6">
          <p className="text-center text-2xl font-semibold text-ink">{heading}</p>
          <p className="mt-2 text-center text-[14.7px] text-ink-light">{intro}</p>
          {form}
          {signOutLink}
          <AuthFooter onLight topGap="mt-4" compact />
        </div>
      </div>
    )
  }

  // Desktop: split-screen card, matching Login and Sign-up.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-accent px-4 py-10">
      <div className="flex w-full max-w-[80rem] overflow-hidden rounded-xl border border-accent/50 bg-canvas-raised shadow-raised md:flex-row">
        <AuthHero />

        <div className="flex flex-1 flex-col justify-center bg-accent-panel px-[4.375rem] py-[5.75rem]">
          <div className="mx-auto w-full max-w-sm">
            <p className="text-base font-semibold text-ink md:text-2xl lg:text-3xl">{heading}</p>
            <p className="mt-2 text-sm text-ink-muted">{intro}</p>
            {form}
            {signOutLink}
          </div>
        </div>
      </div>

      <AuthFooter />
    </div>
  )
}
