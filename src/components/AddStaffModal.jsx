import { useState } from 'react'
import Modal from './Modal'
import SelectMenu from './SelectMenu'
import DateFieldButton from './DateFieldButton'
import GeneratedPasswordNotice from './GeneratedPasswordNotice'
import { formatPhoneProgressive } from '../lib/phone'
import { isValidEmail } from '../lib/validateEmail'
import { CATEGORY_LABELS } from '../lib/categoryLabels'
import {
  categoryValuesForRole,
  categoryNeedsContractChoice,
  CONTRACT_TYPE_OPTIONS,
  OT_SUBTYPE_OPTIONS,
  ROTATION_PLANNED_CATEGORIES,
} from '../lib/staffDefaults'
import { createStaffAccount } from '../lib/staffCredentials'

// Admin-initiated account creation — the second, parallel path onto the
// system alongside self-registration, for staff who cannot sign up for
// themselves yet (an incoming Registrar or Intern with a known start date
// and no reason to have an account before day one). Self-registration is
// untouched by this: locums and clerks still sign up and get approved the
// same way they always have.
//
// The account it creates is already approved. is_approved answers "has an
// admin vetted that this person belongs here", and an admin who just typed
// this person's real name, category and start date has already answered it
// — there is no stranger to vet, unlike a self-registration where anyone
// with an email address can appear in the queue. What the new account does
// carry is must_change_password, an unrelated one-time credential-hygiene
// step: they sign in with the password an admin issued and are made to
// replace it before anything else in the app is reachable.
const ROLE_OPTIONS = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'locum',  label: 'Locum' },
  { value: 'clerk',  label: 'Clerk' },
]

function categoryOptionsForRole(role) {
  return categoryValuesForRole(role).map(value => ({ value, label: CATEGORY_LABELS[value] || value }))
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

export default function AddStaffModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('doctor')
  const [category, setCategory] = useState('')
  const [contractType, setContractType] = useState('full')
  const [subtype, setSubtype] = useState(null)
  const [activeFrom, setActiveFrom] = useState('')
  const [activeUntil, setActiveUntil] = useState('')
  const [rotationStart, setRotationStart] = useState('')
  const [rotationEnd, setRotationEnd] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const needsContractChoice = role !== 'clerk' && categoryNeedsContractChoice(category)
  const showsRotation = role === 'doctor' && ROTATION_PLANNED_CATEGORIES.has(category)

  // The rotation block's EC/OT type is derived, never asked for separately:
  // for COSMO/Intern it is the Hours choice above restated (the same
  // contract_type → rotation_type mapping applyHoursChange uses), and a
  // Registrar's rotation is EC-only. A second, independently-set dropdown
  // here would let an admin save a doctor whose contract says OT and whose
  // rotation block says EC.
  const rotationType = category === 'Registrar'
    ? 'EC'
    : contractType === 'Junior_Doctor_Overtime' ? 'OT' : 'EC'

  function handleRoleChange(next) {
    setRole(next)
    // Categories are role-specific, so a category that no longer applies
    // to the new role is dropped rather than silently submitted and
    // normalised away server-side.
    if (!categoryValuesForRole(next).includes(category)) {
      setCategory('')
      setContractType('full')
      setSubtype(null)
    }
  }

  function handleCategoryChange(next) {
    setCategory(next)
    if (!categoryNeedsContractChoice(next)) {
      setContractType('full')
      setSubtype(null)
    }
    if (!ROTATION_PLANNED_CATEGORIES.has(next)) {
      setRotationStart('')
      setRotationEnd('')
    }
  }

  function validate() {
    if (!name.trim()) return 'First name is required.'
    if (!surname.trim()) return 'Surname is required.'
    if (phone.length !== 10) return 'Enter a 10-digit mobile number.'
    if (!isValidEmail(email.trim())) return 'Enter a valid email address.'
    if (role === 'doctor' && !category) return 'Select a category.'
    if (needsContractChoice && !contractType) return 'Select EC or OT hours.'
    if (!activeFrom) return 'Select the date this person becomes active.'
    if (activeUntil && activeUntil < activeFrom) return 'Active until must be on or after Active from.'
    if (rotationEnd && rotationStart && rotationEnd < rotationStart) return 'Rotation end must be on or after its start.'
    if (rotationEnd && !rotationStart) return 'Give the rotation a start date, or clear its end date.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setError('')
    setSubmitting(true)
    const response = await createStaffAccount({
      name: name.trim(),
      surname: surname.trim(),
      phone,
      email: email.trim(),
      role,
      category: category || null,
      contractType,
      subtype: contractType === 'Junior_Doctor_Overtime' ? subtype : null,
      activeFrom,
      activeUntil: activeUntil || null,
      rotation: showsRotation && rotationStart
        ? { rotationType, subtype: rotationType === 'OT' ? subtype : null, startDate: rotationStart, endDate: rotationEnd || null }
        : null,
    })
    setSubmitting(false)

    if (!response.ok) {
      setError(response.error)
      return
    }
    setResult(response)
  }

  // ── Confirmation ────────────────────────────────────────────
  // Creating the account and emailing the password are two steps that
  // fail independently, so they are reported separately rather than
  // collapsed into one "done" — an admin who is told only "created" would
  // never know the person never got their login.
  if (result) {
    const fullName = `${name.trim()} ${surname.trim()}`.trim()
    return (
      <Modal
        title={result.emailSent ? 'Account created' : 'Account created — email not sent'}
        onClose={() => { onCreated?.(); onClose() }}
        footer={
          <button type="button" className="btn-primary" onClick={() => { onCreated?.(); onClose() }}>
            Done
          </button>
        }
      >
        {result.emailSent ? (
          <p className="text-sm text-ink">
            {fullName}&apos;s account is ready and their login details have been emailed to{' '}
            <span className="font-medium">{email.trim()}</span>. They&apos;ll be asked to set their own
            password the first time they sign in.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {fullName}&apos;s account was created successfully, but the welcome email to{' '}
              <span className="font-medium">{email.trim()}</span> could not be sent
              {result.emailError ? ` (${result.emailError})` : ''}.
            </p>
            {result.password && <GeneratedPasswordNotice password={result.password} />}
          </>
        )}

        {result.rotationError && (
          <p className="mt-3 text-sm text-flagAmber">
            The account was created, but its first rotation block wasn&apos;t saved
            ({result.rotationError}). Add it in the Intern Rotations Planner.
          </p>
        )}

        <p className="mt-3 text-xs text-ink-muted">
          They become active on {activeFrom} — until then the account exists and can be signed into,
          but is left out of scheduling.
        </p>
      </Modal>
    )
  }

  // ── Form ────────────────────────────────────────────────────
  return (
    <Modal
      title="Add staff"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form="add-staff-form" className="btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="add-staff-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted">
          Creates the account straight away with a generated password, emailed to them along with a
          login link. They set their own password on first sign-in. No approval step — creating the
          account is the approval.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="staff-name">
            <input
              id="staff-name"
              type="text"
              required
              autoComplete="off"
              className="input-field"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </Field>
          <Field label="Surname" htmlFor="staff-surname">
            <input
              id="staff-surname"
              type="text"
              required
              autoComplete="off"
              className="input-field"
              value={surname}
              onChange={e => setSurname(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Mobile number" htmlFor="staff-phone">
          <input
            id="staff-phone"
            type="tel"
            required
            inputMode="numeric"
            autoComplete="off"
            className="input-field"
            placeholder="(082) 123-4567"
            value={formatPhoneProgressive(phone)}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
        </Field>

        <Field
          label="Email"
          htmlFor="staff-email"
          hint="This is the username they sign in with, and where their password is sent."
        >
          <input
            id="staff-email"
            type="email"
            required
            autoComplete="off"
            className="input-field"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role">
            <SelectMenu value={role} onChange={handleRoleChange} options={ROLE_OPTIONS} />
          </Field>
          {role !== 'clerk' && (
            <Field label="Category">
              <SelectMenu
                value={category}
                onChange={handleCategoryChange}
                placeholder={role === 'locum' ? 'None' : 'Select…'}
                options={categoryOptionsForRole(role)}
              />
            </Field>
          )}
        </div>

        {needsContractChoice && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Hours">
              <SelectMenu
                value={contractType}
                onChange={v => { setContractType(v); if (v !== 'Junior_Doctor_Overtime') setSubtype(null) }}
                placeholder="Select…"
                options={CONTRACT_TYPE_OPTIONS}
              />
            </Field>
            {contractType === 'Junior_Doctor_Overtime' && (
              <Field label="OT subtype">
                <SelectMenu
                  value={subtype || ''}
                  onChange={setSubtype}
                  placeholder="Not yet assigned…"
                  options={OT_SUBTYPE_OPTIONS}
                />
              </Field>
            )}
          </div>
        )}

        <Field
          label="Active from"
          hint="The account is created inactive and joins scheduling on this date, via the existing daily status job."
        >
          <DateFieldButton label="Active from" value={activeFrom} onChange={setActiveFrom} required />
        </Field>

        <Field label="Active until" hint="Optional — for a fixed-term placement with a known end date.">
          <DateFieldButton label="Active until" value={activeUntil} onChange={setActiveUntil} min={activeFrom || undefined} />
        </Field>

        {showsRotation && (
          <div className="rounded border border-slate-line bg-canvas-sunken px-3 py-3">
            <p className="text-sm font-medium text-ink">First rotation</p>
            <p className="mt-1 text-xs text-ink-muted">
              Optional — creates their opening block in the Intern Rotations Planner. It&apos;s
              {' '}{rotationType === 'OT' ? 'an OT' : 'an EC'} block, taken from
              {category === 'Registrar' ? ' the EC-only rule for registrars' : ' the Hours choice above'};
              change it later in the planner. Leave the start date empty if the placement isn&apos;t known yet.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <DateFieldButton label="Rotation from" value={rotationStart} onChange={setRotationStart} />
              <DateFieldButton label="Rotation to" value={rotationEnd} onChange={setRotationEnd} min={rotationStart || undefined} />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>
        )}
      </form>
    </Modal>
  )
}
