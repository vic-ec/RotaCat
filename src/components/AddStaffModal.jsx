import { useState } from 'react'
import { Plus, X } from 'lucide-react'
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
  roleNeedsCategoryAtCreation,
  CONTRACT_TYPE_OPTIONS,
  OT_SUBTYPE_OPTIONS,
  ROTATION_PLANNED_CATEGORIES,
  ROTATION_TYPE_KEY_OPTIONS,
  rotationTypeKey,
  rotationTypeOptionsForCategory,
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

const ROTATION_TYPE_BY_KEY = Object.fromEntries(ROTATION_TYPE_KEY_OPTIONS.map(o => [o.key, o]))

function categoryOptionsForRole(role) {
  return categoryValuesForRole(role).map(value => ({ value, label: CATEGORY_LABELS[value] || value }))
}

// A rotation block's EC/OT type is seeded from the Hours choice above (the
// same contract_type → rotation_type mapping applyHoursChange uses), and a
// Registrar's is EC-only. Each block stays independently editable after
// that: an intern's year is planned as a run of blocks that genuinely do
// change type partway through, which is the whole point of adding more
// than one here.
function defaultRotationKey(category, contractType, subtype) {
  if (category === 'Registrar') return 'EC'
  if (contractType !== 'Junior_Doctor_Overtime') return 'EC'
  return rotationTypeKey('OT', subtype)
}

let nextBlockId = 0
function newBlock(typeKey) {
  return { id: `block-${nextBlockId++}`, typeKey, startDate: '', endDate: '' }
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

const EMPTY_FORM = {
  name: '',
  surname: '',
  phone: '',
  email: '',
  role: 'doctor',
  category: '',
  contractType: 'full',
  subtype: null,
  activeFrom: '',
  activeUntil: '',
}

export default function AddStaffModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [blocks, setBlocks] = useState([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const { name, surname, phone, email, role, category, contractType, subtype, activeFrom, activeUntil } = form
  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  const showsCategory = roleNeedsCategoryAtCreation(role)
  const needsContractChoice = showsCategory && categoryNeedsContractChoice(category)
  const showsRotation = showsCategory && ROTATION_PLANNED_CATEGORIES.has(category)
  const rotationTypeOptions = rotationTypeOptionsForCategory(category)
    .map(o => ({ value: o.key, label: o.label }))

  function handleRoleChange(next) {
    // Categories are role-specific, so a category that no longer applies to
    // the new role is dropped rather than silently submitted and normalised
    // away server-side.
    const keepsCategory = roleNeedsCategoryAtCreation(next)
      && categoryValuesForRole(next).includes(category)
    set({ role: next, ...(keepsCategory ? {} : { category: '', contractType: 'full', subtype: null }) })
    if (!keepsCategory) setBlocks([])
  }

  function handleCategoryChange(next) {
    const patch = { category: next }
    if (!categoryNeedsContractChoice(next)) {
      patch.contractType = 'full'
      patch.subtype = null
    }
    set(patch)
    if (!ROTATION_PLANNED_CATEGORIES.has(next)) setBlocks([])
    else setBlocks(bs => bs.map(b => (
      // A Registrar can't hold an OT block — re-seed any that no longer
      // applies rather than leaving a value the planner would reject.
      rotationTypeOptionsForCategory(next).some(o => o.key === b.typeKey)
        ? b
        : { ...b, typeKey: defaultRotationKey(next, patch.contractType ?? contractType, patch.subtype ?? subtype) }
    )))
  }

  function handleContractTypeChange(next) {
    const nextSubtype = next === 'Junior_Doctor_Overtime' ? subtype : null
    set({ contractType: next, subtype: nextSubtype })
    // Only the untouched opening block follows the Hours choice; blocks the
    // admin has already dated are theirs, not ours to rewrite.
    setBlocks(bs => bs.map((b, i) => (
      i === 0 && !b.startDate && !b.endDate
        ? { ...b, typeKey: defaultRotationKey(category, next, nextSubtype) }
        : b
    )))
  }

  function addBlock() {
    setBlocks(bs => [...bs, newBlock(
      // Continue from the last block's type — a run of rotations usually
      // repeats before it changes.
      bs.length ? bs[bs.length - 1].typeKey : defaultRotationKey(category, contractType, subtype)
    )])
  }

  const updateBlock = (id, patch) => setBlocks(bs => bs.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const removeBlock = (id) => setBlocks(bs => bs.filter(b => b.id !== id))

  function clearForm() {
    setForm(EMPTY_FORM)
    setBlocks([])
    setError('')
  }

  function validate() {
    if (!name.trim()) return 'First name is required.'
    if (!surname.trim()) return 'Surname is required.'
    if (phone.length !== 10) return 'Enter a 10-digit mobile number.'
    if (!isValidEmail(email.trim())) return 'Enter a valid email address.'
    if (showsCategory && !category) return 'Select a category.'
    if (needsContractChoice && !contractType) return 'Select EC or OT hours.'
    if (!activeFrom) return 'Select the date this person becomes active.'
    if (activeUntil && activeUntil < activeFrom) return 'Active until must be on or after Active from.'

    for (const [i, b] of blocks.entries()) {
      const label = blocks.length > 1 ? `Rotation ${i + 1}` : 'The rotation'
      if (b.endDate && !b.startDate) return `${label} needs a start date, or clear its end date.`
      if (b.startDate && b.endDate && b.endDate < b.startDate) return `${label} must end on or after it starts.`
    }
    // Overlapping blocks aren't rejected by the database, and nothing
    // downstream resolves them — rotationForDate takes the first match — so
    // two blocks covering one day would silently pick a winner.
    const dated = blocks.filter(b => b.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate))
    for (let i = 1; i < dated.length; i++) {
      const prev = dated[i - 1]
      if (!prev.endDate || prev.endDate >= dated[i].startDate) {
        return 'Rotations overlap — give each block an end date before the next one starts.'
      }
    }
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
      category: showsCategory ? (category || null) : null,
      contractType,
      subtype: contractType === 'Junior_Doctor_Overtime' ? subtype : null,
      activeFrom,
      activeUntil: activeUntil || null,
      rotations: showsRotation
        ? blocks
          .filter(b => b.startDate)
          .map(b => ({
            rotationType: ROTATION_TYPE_BY_KEY[b.typeKey]?.rotationType ?? 'EC',
            subtype: ROTATION_TYPE_BY_KEY[b.typeKey]?.subtype ?? null,
            startDate: b.startDate,
            endDate: b.endDate || null,
          }))
        : [],
    })
    setSubmitting(false)

    if (!response.ok) {
      setError(response.error)
      return
    }
    setResult(response)
  }

  // ── Confirmation ────────────────────────────────────────────
  // Creating the account and emailing the password are two steps that fail
  // independently, so they are reported separately rather than collapsed
  // into one "done" — an admin who is told only "created" would never know
  // the person never got their login.
  if (result) {
    const fullName = `${name.trim()} ${surname.trim()}`.trim()
    return (
      <Modal
        title={result.emailSent ? 'Account created' : 'Account created — email not sent'}
        onClose={() => { onCreated?.(); onClose() }}
        footer={
          <button type="button" className="btn-primary flex-1 py-2.5 text-[15px]" onClick={() => { onCreated?.(); onClose() }}>
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
            The account was created, but its rotation blocks weren&apos;t saved
            ({result.rotationError}). Add them in the Rotations planner.
          </p>
        )}

        <p className="mt-3 text-xs text-ink-muted">
          Until {activeFrom} they&apos;re left out of scheduling — the account exists and can be
          signed into, and the Staff list shows a <span className="font-medium">Temp password</span>{' '}
          tag on their row until they&apos;ve signed in and set their own.
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
          <button type="button" className="btn-secondary px-3 py-2.5 text-[15px]" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn-secondary px-3 py-2.5 text-[15px]" onClick={clearForm} disabled={submitting}>
            Clear form
          </button>
          <button type="submit" form="add-staff-form" className="btn-primary flex-1 whitespace-nowrap px-3 py-2.5 text-[15px]" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="add-staff-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted">
          Create an account for new staff. A temporary password and login link will be sent to their
          email. They set their own password on first sign-in.
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
              onChange={e => set({ name: e.target.value })}
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
              onChange={e => set({ surname: e.target.value })}
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
            onChange={e => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
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
            onChange={e => set({ email: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role">
            <SelectMenu value={role} onChange={handleRoleChange} options={ROLE_OPTIONS} />
          </Field>
          {showsCategory && (
            <Field label="Category">
              <SelectMenu
                value={category}
                onChange={handleCategoryChange}
                placeholder="Select…"
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
                onChange={handleContractTypeChange}
                placeholder="Select…"
                options={CONTRACT_TYPE_OPTIONS}
              />
            </Field>
            {contractType === 'Junior_Doctor_Overtime' && (
              <Field label="OT subtype">
                <SelectMenu
                  value={subtype || ''}
                  onChange={v => set({ subtype: v })}
                  placeholder="Not yet assigned…"
                  options={OT_SUBTYPE_OPTIONS}
                />
              </Field>
            )}
          </div>
        )}

        <Field label="Active from" hint="Set a contract or rotation start date for new staff.">
          <DateFieldButton label="Active from" value={activeFrom} onChange={v => set({ activeFrom: v })} required />
        </Field>

        <Field
          label="Active until"
          hint="Set a rotation end date for interns and registrars with fixed-term placements."
        >
          <DateFieldButton label="Active until" value={activeUntil} onChange={v => set({ activeUntil: v })} min={activeFrom || undefined} />
        </Field>

        {showsRotation && (
          <div className="rounded border border-slate-line bg-canvas-sunken px-3 py-3">
            <p className="text-sm font-medium text-ink">Rotations</p>
            <p className="mt-1 text-xs text-ink-muted">
              Optional — creates their opening blocks in the Rotations planner. Add one block per
              placement to plan out the full year up front; each block&apos;s type starts from the
              Hours choice above and can be changed here or in the planner later.
            </p>

            {blocks.length > 0 && (
              <div className="mt-3 space-y-3">
                {blocks.map((block, i) => (
                  <div key={block.id} className="rounded border border-slate-line bg-canvas-raised px-2.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-14 flex-shrink-0 text-xs font-medium text-ink-muted">
                        Block {i + 1}
                      </span>
                      <SelectMenu
                        value={block.typeKey}
                        onChange={v => updateBlock(block.id, { typeKey: v })}
                        options={rotationTypeOptions}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeBlock(block.id)}
                        aria-label={`Remove rotation block ${i + 1}`}
                        title="Remove block"
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-flagRed hover:bg-flagRed-bg"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <DateFieldButton
                        label="From"
                        value={block.startDate}
                        onChange={v => updateBlock(block.id, { startDate: v })}
                      />
                      <DateFieldButton
                        label="To"
                        value={block.endDate}
                        onChange={v => updateBlock(block.id, { endDate: v })}
                        min={block.startDate || undefined}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addBlock}
              className="btn-secondary mt-3 flex w-full items-center justify-center gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add rotation
            </button>
          </div>
        )}

        {error && (
          <div className="rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>
        )}
      </form>
    </Modal>
  )
}
