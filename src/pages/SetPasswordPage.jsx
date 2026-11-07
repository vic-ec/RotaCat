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
import PasswordRevealToggle from '../components/PasswordRevealToggle'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'
import { useIsDesktop } from '../lib/useIsDesktop'
import { authFieldClass, authButtonClass, AUTH_LABEL_LG, AUTH_PANEL, AUTH_ERROR, AUTH_FIELD_ERROR } from '../lib/authStyles'

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
  // One flag per field rather than one shared: this screen asks for three
  // passwords at once, and revealing the one being checked shouldn't put
  // the other two on screen alongside it.
  const [revealed, setRevealed] = useState({ current: false, password: false, confirm: false })
  const toggleReveal = (field) => setRevealed(r => ({ ...r, [field]: !r[field] }))
  const capsLock = useCapsLockWarning()

  // Live checks, derived from the fields rather than stored: the policy
  // message appears once the new password has been typed and goes away by
  // itself the moment the criteria are met, and the mismatch message
  // tracks the confirm field keystroke by keystroke instead of waiting for
  // a submit. `submitted` surfaces them on an untouched field too, so a
  // premature submit still points at what is missing.
  const [submitted, setSubmitted] = useState(false)
  const policyProblem = password ? passwordProblem(password) : (submitted ? passwordProblem(password) : '')
  const mismatch = (confirm || submitted) && password !== confirm

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitted(true)

    if (!current) {
      setError('Enter the temporary password from your welcome email.')
      return
    }
    // The inline messages under the fields already say what is wrong.
    if (passwordProblem(password) || password !== confirm) return
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

  // pr-12 leaves room for the reveal toggle sitting inside the field.
  const fieldClass = authFieldClass({ trailing: true, large: true })

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 md:mt-8 md:gap-[22px]">
      <div>
        <label htmlFor="current-password" className={AUTH_LABEL_LG}>
          Temporary password
        </label>
        <div className="relative">
          <input
            id="current-password"
            name="current-password"
            type={revealed.current ? 'text' : 'password'}
            required
            autoFocus
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            onKeyDown={capsLock.onKeyDown}
            onKeyUp={capsLock.onKeyUp}
            placeholder="From your welcome email"
            className={fieldClass}
          />
          <PasswordRevealToggle revealed={revealed.current} onToggle={() => toggleReveal('current')} controls="current-password" />
        </div>
      </div>

      <div>
        {/* The icon sits beside the label rather than inside it — a
            tooltip nested in the <label> becomes part of the input's
            accessible name, so a screen reader would read the whole
            requirements sentence out as the field's name. */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <label htmlFor="password" className={`${AUTH_LABEL_LG} mb-0`}>
            New password
          </label>
          <PasswordRequirementsInfo />
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={revealed.password ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={capsLock.onKeyDown}
            onKeyUp={capsLock.onKeyUp}
            placeholder="Enter new password"
            aria-invalid={Boolean(policyProblem)}
            aria-describedby={policyProblem ? 'password-problem' : undefined}
            className={fieldClass}
          />
          <PasswordRevealToggle revealed={revealed.password} onToggle={() => toggleReveal('password')} controls="password" />
        </div>
        {policyProblem && (
          <p id="password-problem" className={AUTH_FIELD_ERROR}>{policyProblem}</p>
        )}
      </div>

      <div>
        {/* The icon sits beside the label rather than inside it — a
            tooltip nested in the <label> becomes part of the input's
            accessible name, so a screen reader would read the whole
            requirements sentence out as the field's name. */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <label htmlFor="confirm" className={`${AUTH_LABEL_LG} mb-0`}>
            Confirm password
          </label>
          <PasswordRequirementsInfo />
        </div>
        <div className="relative">
          <input
            id="confirm"
            name="confirm"
            type={revealed.confirm ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={capsLock.onKeyDown}
            onKeyUp={capsLock.onKeyUp}
            placeholder="Re-enter new password"
            aria-invalid={Boolean(mismatch)}
            aria-describedby={mismatch ? 'confirm-problem' : undefined}
            className={fieldClass}
          />
          <PasswordRevealToggle revealed={revealed.confirm} onToggle={() => toggleReveal('confirm')} controls="confirm" />
        </div>
        {mismatch && (
          <p id="confirm-problem" className={AUTH_FIELD_ERROR}>Passwords do not match.</p>
        )}
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
  // Teal and underlined like every other auth-screen link (rose is a brand
  // accent, not a UI colour); on the phone sheet it takes the sheet's mint.
  const signOutLink = (onSheen) => (
    <button
      type="button"
      onClick={signOut}
      className={`mt-4 block w-full text-center text-[14.7px] font-medium underline underline-offset-4 transition-colors ${
        onSheen
          ? 'text-auth-sheet-link decoration-auth-sheet-link/45 hover:text-auth-sheet-ink hover:decoration-auth-sheet-ink'
          : 'text-accent decoration-accent/45 hover:text-accent-dark hover:decoration-accent-dark'
      }`}
    >
      Sign out instead
    </button>
  )

  const form = <SetPasswordForm profile={profile} onDone={handleDone} />

  // Mobile: full-bleed white hero above a rounded bottom sheet on the deep
  // brushed ground — the same shape as LoginPage's phone landing, which is
  // where the emailed login link lands people first. The heading, intro
  // and sign-out link take the sheet's own light inks; the form itself
  // sits in a white panel on the sheet (as Create-account's role cards
  // do), so its labels, field messages and Caps Lock notice keep the
  // colours they have everywhere else.
  if (!isDesktop) {
    return (
      <div className="flex min-h-dvh flex-col bg-auth-hero">
        <MobileAuthHero />

        <div className="auth-page relative -mt-[28px] flex flex-none flex-col justify-center rounded-t-[28px] px-5 pb-5 pt-6">
          <h2 className="text-center text-2xl font-semibold text-auth-sheet-ink">{heading}</h2>
          <p className="mt-2 text-center text-[14.7px] text-auth-sheet-ink-light">{intro}</p>
          <div className="mt-4 rounded-[14px] border border-auth-shell-border bg-auth-panel px-4 pb-4 pt-1">
            {form}
          </div>
          {signOutLink(true)}
          <AuthFooter onSheen topGap="mt-4" compact />
        </div>
      </div>
    )
  }

  // Desktop: the login card — white halves, 1px seam — on the brushed page.
  return (
    <div className="auth-page flex min-h-dvh flex-col items-center justify-center px-[4vw] py-[3.75vw]">
      <div className={`mx-auto flex w-full max-w-[1800px] min-h-[720px] overflow-hidden md:flex-row ${AUTH_PANEL}`}>
        <AuthHero seam="shell" />

        <div className="relative flex flex-1 flex-col justify-center px-10 py-16 lg:px-[4.375rem]">
          <div className="mx-auto w-full max-w-[456px]">
            <h2 className="text-center text-3xl font-semibold text-ink">{heading}</h2>
            <p className="mt-2 text-center text-base text-ink-light">{intro}</p>
            {form}
            {signOutLink(false)}
          </div>
          <div className="absolute inset-x-0 bottom-6">
            <AuthFooter onLight topGap="mt-0" />
          </div>
        </div>
      </div>
    </div>
  )
}
