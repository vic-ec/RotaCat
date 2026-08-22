import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { PASSWORD_HINT, passwordProblem } from '../lib/passwordPolicy'
import { formatPhoneProgressive } from '../lib/phone'
import { isValidEmail } from '../lib/validateEmail'
import { categoryLabel } from '../lib/categoryLabels'
import {
  fetchOwnRotations, rotationOptionsForOnboarding, rotationsProblem,
  submitOnboarding, toFormRows, toRotationPayload,
} from '../lib/onboarding'
import SelectMenu from '../components/SelectMenu'
import DateFieldButton from '../components/DateFieldButton'
import CapsLockNotice from '../components/CapsLockNotice'
import AuthFooter from '../components/AuthFooter'
import { useCapsLockWarning } from '../lib/useCapsLockWarning'

// First-sign-in flow for interns and registrars (/welcome). Three steps:
// set your own password (only when you arrived on an admin-issued one),
// confirm your contact details, then lay out your rotation blocks.
//
// It's a gate, not a page you can wander into: ProtectedRoute sends every
// authenticated route here while profiles.onboarding_completed_at is null,
// and there's no skip. The rotation step is the reason it exists —
// intern_rotations is what resolves an intern to the EC or OT pool on any
// date, and the person who knows those dates is the intern.
//
// The final save goes through the complete_onboarding RPC rather than
// client writes: intern_rotations is admin-only under RLS, and doing it in
// one transaction means a failure can't leave someone stuck on this screen
// with half their rotation history already written.

function StepDots({ steps, current }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((step, i) => (
        <div key={step} className="flex flex-1 items-center gap-2">
          <span
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i < current ? 'bg-success text-white'
              : i === current ? 'bg-accent text-white'
              : 'bg-canvas-sunken text-ink-muted'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </span>
          <span className={`hidden text-xs font-medium sm:block ${i === current ? 'text-ink' : 'text-ink-muted'}`}>
            {step}
          </span>
          {i < steps.length - 1 && <span className="h-px flex-1 bg-slate-line" />}
        </div>
      ))}
    </div>
  )
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label-text">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export default function WelcomePage() {
  const {
    profile, user, mustChangePassword, needsOnboarding, refreshProfile,
    changeEmail, verifyEmailChangeOtp,
  } = useAuth()
  const navigate = useNavigate()

  const steps = [...(mustChangePassword ? ['Password'] : []), 'Your details', 'Rotations']
  const [stepIndex, setStepIndex] = useState(0)
  const stepName = steps[stepIndex]

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Password step ──────────────────────────────────────────
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const capsLock = useCapsLockWarning()

  // ── Details step ───────────────────────────────────────────
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')

  // Email is changed through Supabase auth, not the profiles row, so it
  // runs as its own confirm-by-code side flow rather than saving with the
  // rest of the step. 'second' is the back half of a Secure email change,
  // where the current address gets a code of its own.
  const [emailStage, setEmailStage] = useState('idle') // idle | editing | sent | second
  const [newEmail, setNewEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [emailError, setEmailError] = useState('')

  // ── Rotations step ─────────────────────────────────────────
  const [rows, setRows] = useState([])
  const [rotationsLoaded, setRotationsLoaded] = useState(false)

  const category = profile?.category
  const rotationOptions = rotationOptionsForOnboarding(category)
  const registrarEcOnly = category === 'Registrar'

  useEffect(() => {
    if (!profile) return
    setName(profile.name || '')
    setSurname(profile.surname || '')
    setPhone((profile.phone || '').replace(/\D/g, '').slice(0, 10))
  }, [profile])

  // Pre-fill from whatever an admin already entered at account creation,
  // so the form shows the real starting point — the RPC replaces this
  // person's blocks wholesale with what comes back, so an empty form would
  // silently drop an existing block.
  useEffect(() => {
    let cancelled = false
    if (!profile?.id) return undefined
    fetchOwnRotations(profile.id).then(existing => {
      if (cancelled) return
      const formRows = toFormRows(existing)
      setRows(formRows.length > 0 ? formRows : [{ key: 'EC', startDate: '', endDate: '' }])
      setRotationsLoaded(true)
    })
    return () => { cancelled = true }
  }, [profile?.id])

  if (!needsOnboarding) return <Navigate to="/" replace />

  function goNext() {
    setError('')
    setStepIndex(i => i + 1)
  }

  // ── Step handlers ──────────────────────────────────────────
  async function handlePasswordStep(e) {
    e.preventDefault()
    setError('')

    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('Passwords do not match.')

    setSaving(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) {
      setSaving(false)
      return setError(authError.message)
    }
    // Only after the password actually changed — clearing the flag first
    // would lift the gate for someone still on the issued password.
    const { error: flagError } = await supabase
      .from('profiles').update({ must_change_password: false }).eq('id', profile.id)
    setSaving(false)
    if (flagError) return setError(flagError.message)

    await refreshProfile()
    goNext()
  }

  async function handleDetailsStep(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) return setError('Enter your first name.')
    if (!surname.trim()) return setError('Enter your surname.')
    if (phone.length !== 10) return setError('Enter a 10-digit mobile number.')
    if (emailStage !== 'idle') return setError('Finish confirming your new email address first, or cancel the change.')

    // Name and surname go straight to the profiles row (allowed by
    // profiles_update_own). The mobile number rides along with the final
    // submit instead, so it lands in the same transaction as the rotations.
    setSaving(true)
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ name: name.trim(), surname: surname.trim() })
      .eq('id', profile.id)
    setSaving(false)
    if (saveError) return setError(saveError.message)

    goNext()
  }

  async function sendEmailCode(e) {
    e.preventDefault()
    setEmailError('')

    const target = newEmail.trim().toLowerCase()
    if (!isValidEmail(target)) return setEmailError('Enter a valid email address.')
    if (target === (user?.email || '').toLowerCase()) return setEmailError('That is already your email address.')

    setSaving(true)
    const { error: sendError } = await changeEmail(target)
    setSaving(false)
    if (sendError) return setEmailError(sendError.message)

    setOtp('')
    setEmailStage('sent')
    setEmailMsg(`Enter the 6-digit code we sent to ${target}.`)
  }

  async function confirmEmailCode(e) {
    e.preventDefault()
    setEmailError('')

    // Which address received THIS code: the new one first, then the
    // current one if the project requires both halves.
    const target = emailStage === 'second' ? (user?.email || '') : newEmail.trim().toLowerCase()

    setSaving(true)
    const { error: verifyError } = await verifyEmailChangeOtp(target, otp)
    if (verifyError) {
      setSaving(false)
      return setEmailError(verifyError.message)
    }

    const { data } = await supabase.auth.getUser()
    setSaving(false)
    const liveEmail = (data?.user?.email || '').toLowerCase()

    if (liveEmail === newEmail.trim().toLowerCase()) {
      setEmailStage('idle')
      setEmailMsg('Email address updated.')
      setOtp('')
      await refreshProfile()
      return
    }

    // Still on the old address: Secure email change is on, and the
    // current address has a code of its own to confirm.
    setOtp('')
    setEmailStage('second')
    setEmailMsg(`Now enter the code sent to your current address, ${user?.email}.`)
  }

  function cancelEmailChange() {
    setEmailStage('idle')
    setNewEmail('')
    setOtp('')
    setEmailError('')
    setEmailMsg('')
  }

  function updateRow(index, patch) {
    setRows(rs => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    // A new block most often follows the last one, so seed it from there
    // rather than making them re-derive the same date.
    const last = rows[rows.length - 1]
    setRows(rs => [...rs, { key: 'EC', startDate: last?.endDate || '', endDate: '' }])
  }

  function removeRow(index) {
    setRows(rs => rs.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const problem = rotationsProblem(rows, category)
    if (problem) return setError(problem)

    setSaving(true)
    const result = await submitOnboarding({ phone, rotations: toRotationPayload(rows) })
    if (!result.ok) {
      setSaving(false)
      return setError(result.error)
    }
    await refreshProfile()
    setSaving(false)
    navigate('/', { replace: true })
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-accent px-4 py-6">
      <div className="w-full max-w-xl rounded-xl border border-accent/50 bg-canvas-raised p-6 shadow-raised md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Welcome to RotaCat</p>
        <h1 className="mt-1 font-display text-xl font-bold text-ink md:text-2xl">
          Hi {profile?.name || 'there'} — let&apos;s get you set up
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          A few things before you start{category ? `, as ${categoryLabel(category) === 'Intern' ? 'an' : 'a'} ${categoryLabel(category)}` : ''}.
          This only happens once.
        </p>

        <div className="mt-6">
          <StepDots steps={steps} current={stepIndex} />
        </div>

        {/* ── Password ─────────────────────────────────── */}
        {stepName === 'Password' && (
          <form onSubmit={handlePasswordStep} className="space-y-4">
            <p className="text-sm text-ink">
              You signed in with a password an administrator generated. Choose your own to replace it.
            </p>
            <Field label="New password" htmlFor="wp-password" hint={PASSWORD_HINT}>
              <input
                id="wp-password" type="password" required autoFocus autoComplete="new-password"
                className="input-field" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={capsLock.onKeyDown} onKeyUp={capsLock.onKeyUp} onBlur={capsLock.onBlur}
              />
            </Field>
            <Field label="Confirm password" htmlFor="wp-confirm">
              <input
                id="wp-confirm" type="password" required autoComplete="new-password"
                className="input-field" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={capsLock.onKeyDown} onKeyUp={capsLock.onKeyUp} onBlur={capsLock.onBlur}
              />
              <CapsLockNotice show={capsLock.capsOn} />
            </Field>

            {error && <div className="rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>}

            <button type="submit" disabled={saving} className="btn-primary w-full py-2">
              {saving ? 'Saving…' : 'Save password and continue'}
            </button>
          </form>
        )}

        {/* ── Details ──────────────────────────────────── */}
        {stepName === 'Your details' && (
          <form onSubmit={handleDetailsStep} className="space-y-4">
            <p className="text-sm text-ink">Check these are right — we use them to reach you about shifts.</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="wp-name">
                <input id="wp-name" type="text" required className="input-field" value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field label="Surname" htmlFor="wp-surname">
                <input id="wp-surname" type="text" required className="input-field" value={surname} onChange={e => setSurname(e.target.value)} />
              </Field>
            </div>

            <Field label="Mobile number" htmlFor="wp-phone">
              <input
                id="wp-phone" type="tel" required inputMode="numeric" className="input-field"
                placeholder="(082) 123-4567"
                value={formatPhoneProgressive(phone)}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </Field>

            {/* Email lives in Supabase auth, not the profiles row, so it
                changes through its own confirm-by-code flow. */}
            <div className="rounded border border-slate-line bg-canvas-sunken px-3 py-3">
              <p className="label-text mb-1">Email</p>

              {emailStage === 'idle' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-all text-sm text-ink">{user?.email}</span>
                  <button
                    type="button"
                    onClick={() => { setEmailStage('editing'); setNewEmail(''); setEmailMsg(''); setEmailError('') }}
                    className="btn-secondary flex-shrink-0"
                  >
                    Change
                  </button>
                </div>
              )}

              {emailStage === 'editing' && (
                <div className="space-y-2">
                  <input
                    type="email" className="input-field" placeholder="new.address@example.com"
                    value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={sendEmailCode} disabled={saving} className="btn-primary">
                      {saving ? 'Sending…' : 'Send code'}
                    </button>
                    <button type="button" onClick={cancelEmailChange} className="btn-secondary">Cancel</button>
                  </div>
                </div>
              )}

              {(emailStage === 'sent' || emailStage === 'second') && (
                <div className="space-y-2">
                  <p className="text-sm text-ink">{emailMsg}</p>
                  <input
                    type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    className="input-field text-center tracking-[0.3em]" placeholder="123456"
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={confirmEmailCode} disabled={saving || otp.length !== 6} className="btn-primary">
                      {saving ? 'Confirming…' : 'Confirm'}
                    </button>
                    <button type="button" onClick={cancelEmailChange} className="btn-secondary">Cancel</button>
                  </div>
                </div>
              )}

              {emailStage === 'idle' && emailMsg && <p className="mt-2 text-xs text-success">{emailMsg}</p>}
              {emailError && <p className="mt-2 text-xs text-flagRed">{emailError}</p>}
            </div>

            {error && <div className="rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>}

            <button type="submit" disabled={saving} className="btn-primary w-full py-2">
              {saving ? 'Saving…' : 'Continue'}
            </button>
          </form>
        )}

        {/* ── Rotations ────────────────────────────────── */}
        {stepName === 'Rotations' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-sm text-ink">
                {registrarEcOnly
                  ? 'When does your placement in the Emergency Centre run?'
                  : 'Set out your rotation blocks — one for each placement, with the dates it runs.'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                This is what tells the roster which pool you belong to on any given day, so leave, weekends and
                hours are all counted against the right one. You can change it later with an admin.
              </p>
            </div>

            {!rotationsLoaded ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row, i) => (
                  <div key={i} className="rounded border border-slate-line bg-canvas-sunken px-3 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Rotation {i + 1}
                      </p>
                      {rows.length > 1 && (
                        <button
                          type="button" onClick={() => removeRow(i)}
                          aria-label={`Remove rotation ${i + 1}`}
                          className="text-ink-muted transition-colors hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {registrarEcOnly ? (
                      // A registrar's placement is always EC, so there's
                      // nothing to choose — stating it beats a dropdown
                      // with one option in it.
                      <p className="mb-2 text-sm font-medium text-ink">Emergency Centre (EC)</p>
                    ) : (
                      <div className="mb-2">
                        <SelectMenu
                          value={row.key}
                          onChange={v => updateRow(i, { key: v })}
                          options={rotationOptions.map(o => ({ value: o.key, label: o.label }))}
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <DateFieldButton
                        label="From" value={row.startDate}
                        onChange={v => updateRow(i, { startDate: v })}
                      />
                      <DateFieldButton
                        label="To" value={row.endDate}
                        min={row.startDate || undefined}
                        onChange={v => updateRow(i, { endDate: v })}
                      />
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRow} className="btn-secondary">
                  <Plus className="h-4 w-4" /> Add another rotation
                </button>
              </div>
            )}

            {error && <div className="rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>}

            <button type="submit" disabled={saving || !rotationsLoaded} className="btn-primary w-full py-2">
              {saving ? 'Saving…' : 'Finish and go to my dashboard'}
            </button>
          </form>
        )}
      </div>

      <AuthFooter />
    </div>
  )
}
