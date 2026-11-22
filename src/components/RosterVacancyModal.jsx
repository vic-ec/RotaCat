import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import DoctorDropdown from './DoctorDropdown'
import NewLocumModal from './NewLocumModal'
import SelectMenu from './SelectMenu'
import DateFieldButton from './DateFieldButton'
import {
  findSameDayConflict, resolveVacancy, VACANCY_REASON_OPTIONS, VACANCY_LEAVE_TYPE_OPTIONS,
} from '../lib/rosterVacancy'
import { leaveRangeOn } from '../lib/approvedLeave'
import { isOnApprovedLeave } from '../lib/rosterAssignmentEligibility'
import { LEAVE_TYPE_LABELS } from '../lib/leaveRequests'
import { formatShortDateRange } from '../lib/dateRange'
import { labelForShiftCode } from '../lib/shiftLabels'
import { shortDate } from '../lib/reviewLog'

function applyEntryPatch(entries, entryId, patch) {
  return entries.map(e => (e.id === entryId ? { ...e, ...patch } : e))
}

// What happens to the shift. "No cover" is the new state (the doctor off,
// nobody wanted in their place) and is not offered for a swap, which by
// definition has someone taking the shift.
const COVER_OPTIONS = [
  { value: 'replace', label: 'Replace now', hint: 'A doctor or locum takes the shift' },
  { value: 'advertise', label: 'Advertise for a locum', hint: 'An open slot, offered to locums' },
  { value: 'open', label: "Open slot, don't advertise", hint: 'An open slot, filled later by hand' },
  { value: 'none', label: 'No cover', hint: 'The shift runs short; only the struck-through name shows' },
]

// One step of the recursive removal/reassignment workflow for a single
// vacancy on a PUBLISHED roster (see RosterVacancyManager for the stack that
// drives the recursion). `vacancy` = { entryId, date, shiftCode,
// currentProfileId, suggestedReason? }. `entries` is the manager's current
// working copy of the roster month's entries, used only for the same-day
// conflict check — this component doesn't own or refetch that list.
//
// One form, one Save: WHY the doctor is coming off the shift (and, when the
// reason is leave, the leave itself), and WHAT happens to the shift. The
// writes all happen in resolveVacancy, so a half-finished state — leave on
// record but the doctor still rostered, or the reverse — isn't something an
// admin can leave behind by closing the dialog between steps.
export default function RosterVacancyModal({ vacancy, entries, shiftTypes, profiles, displayNames, rosterMonthId, leaveByProfile = {}, locums = [], contacts = [], batchId = null, onResolved, onClose }) {
  const { user } = useAuth()
  const [reason, setReason] = useState(vacancy.suggestedReason || '')
  const [otherLeaveType, setOtherLeaveType] = useState('family_responsibility')
  const [dateFrom, setDateFrom] = useState(vacancy.date)
  const [dateTo, setDateTo] = useState(vacancy.date)
  const [note, setNote] = useState('')
  const [cover, setCover] = useState('')
  // Who takes the shift over: a cover object (see lib/locumCover.js).
  const [replacement, setReplacement] = useState(null)
  const replacementId = replacement?.kind === 'doctor' ? replacement.id : null
  const [picking, setPicking] = useState(false)
  const [addingLocum, setAddingLocum] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const doctor = profiles.find(p => p.id === vacancy.currentProfileId)
  const doctorName = doctor ? `${doctor.name} ${doctor.surname}` : 'This doctor'
  const replacementDoctor = profiles.find(p => p.id === replacementId)
  const replacementName = replacement
    ? (replacement.kind === 'doctor' ? (replacementDoctor ? `${replacementDoctor.name} ${replacementDoctor.surname}` : 'Doctor') : `${replacement.name} (locum)`)
    : null
  const isLeave = reason === 'sick' || reason === 'leave'
  const leaveType = reason === 'sick' ? 'sick' : otherLeaveType
  // Leave already on record over this shift's date (captured from Team
  // Leave, say): it is linked as it stands, not filed a second time.
  const existingLeave = leaveRangeOn(leaveByProfile, vacancy.currentProfileId, vacancy.date)

  // Nobody who is themself on leave that day; the doctor coming off the
  // shift is never their own replacement.
  const candidates = profiles.filter(p =>
    p.id !== vacancy.currentProfileId
    && !isOnApprovedLeave({ leaveByProfile, profileId: p.id, date: vacancy.date }))
  // A locum already on another shift that day is simply not offered: unlike
  // a rostered doctor, there is no second shift of theirs to re-home.
  const freeLocums = locums.filter(l => l.is_active !== false
    && !findSameDayConflict({ entries, date: vacancy.date, profileId: l.id, excludeEntryId: vacancy.entryId }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { patch } = await resolveVacancy({
        rosterMonthId, vacancy, reason, leaveType, dateFrom, dateTo, note, cover, replacement,
        existingLeaveId: isLeave && existingLeave ? (existingLeave[3] || null) : null,
        adminId: user.id,
        entryBefore: entries.find(e => e.id === vacancy.entryId) || null,
        batchId,
      })
      const updatedEntries = applyEntryPatch(entries, vacancy.entryId, patch)
      // A replacement who already holds another shift that day leaves THAT
      // shift needing the same decision — hand it back as the next vacancy.
      const conflict = cover === 'replace' && replacementId
        ? findSameDayConflict({ entries: updatedEntries, date: vacancy.date, profileId: replacementId, excludeEntryId: vacancy.entryId })
        : null
      if (conflict) {
        onResolved({
          entryId: conflict.id,
          date: conflict.date,
          shiftCode: shiftTypes[conflict.shift_type_id] || 'UNKNOWN',
          currentProfileId: replacementId,
          suggestedReason: 'swap',
        }, updatedEntries, { leaveChanged: isLeave, cover, replacementName })
      } else {
        onResolved(null, updatedEntries, { leaveChanged: isLeave, cover, replacementName })
      }
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (addingLocum) {
    return (
      <NewLocumModal
        adminId={user.id}
        onDone={cover_ => { setReplacement(cover_); setCover('replace'); setAddingLocum(false) }}
        onClose={() => setAddingLocum(false)}
      />
    )
  }

  if (picking) {
    return (
      <DoctorDropdown
        profiles={candidates}
        displayNames={displayNames}
        search={search}
        onSearchChange={setSearch}
        onSelect={id => { setReplacement({ kind: 'doctor', id }); setCover('replace'); setPicking(false) }}
        locums={freeLocums}
        contacts={contacts}
        onSelectCover={cover_ => { setReplacement(cover_); setCover('replace'); setPicking(false) }}
        onNewLocum={() => { setPicking(false); setAddingLocum(true) }}
        onRemove={null}
        onClose={() => setPicking(false)}
        date={vacancy.date}
        shiftCode={labelForShiftCode(vacancy.shiftCode)}
      />
    )
  }

  const canSave = Boolean(reason) && Boolean(cover) && (cover !== 'replace' || Boolean(replacement))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center scrim px-4" onClick={saving ? undefined : onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Replace or open shift"
        onSubmit={handleSave}
        className="card max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-medium text-ink">
            {doctorName} · {shortDate(vacancy.date)} · {labelForShiftCode(vacancy.shiftCode)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            This roster is published. Say why {doctor ? doctor.name : 'this doctor'} is coming off the shift and what happens to it.
          </p>
        </div>

        <fieldset>
          <legend className="label-text">Reason</legend>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
            {VACANCY_REASON_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={reason === opt.value}
                onClick={() => { setReason(opt.value); if (opt.value === 'swap' && cover === 'none') setCover('') }}
                className={`${reason === opt.value ? 'btn-primary' : 'btn-secondary'} min-h-[44px] px-3 text-sm md:min-h-0`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        {isLeave && existingLeave && (
          <p className="rounded-lg bg-canvas-sunken p-3 text-xs text-ink-light" data-testid="existing-leave-note">
            {doctorName} already has approved {existingLeave[2] ? (LEAVE_TYPE_LABELS[existingLeave[2]] || 'leave').toLowerCase() : 'leave'} for{' '}
            {formatShortDateRange(existingLeave[0], existingLeave[1])}. This shift is linked to it; no new leave is captured.
          </p>
        )}

        {isLeave && !existingLeave && (
          <>
            {reason === 'leave' && (
              <div>
                <label htmlFor="vacancy-leave-type" className="label-text">Leave type</label>
                <SelectMenu id="vacancy-leave-type" value={otherLeaveType} onChange={setOtherLeaveType} options={VACANCY_LEAVE_TYPE_OPTIONS} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <DateFieldButton id="vacancy-leave-from" label="Leave from" required fullWidth max={vacancy.date} value={dateFrom} onChange={setDateFrom} />
              <DateFieldButton id="vacancy-leave-to" label="Leave to" required fullWidth min={vacancy.date} value={dateTo} onChange={setDateTo} />
            </div>
            <p className="-mt-2 text-xs text-ink-muted">
              Captured for {doctorName} and approved straight away. Extend the dates if they are off for longer than this shift.
            </p>
          </>
        )}

        <div>
          <label htmlFor="vacancy-note" className="label-text">
            Note{reason === 'other' ? ' (required)' : ''}
          </label>
          <textarea
            id="vacancy-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            required={reason === 'other'}
            className="input-field w-full"
            placeholder={isLeave ? 'Optional — saved with the leave…' : 'Optional — admins only…'}
          />
        </div>

        <fieldset>
          <legend className="label-text">What happens to the shift</legend>
          <div className="mt-1 space-y-2">
            {COVER_OPTIONS.filter(opt => opt.value !== 'none' || reason !== 'swap').map(opt => (
              <label key={opt.value} className="flex min-h-[44px] items-center gap-2 text-sm text-ink md:min-h-0">
                <input
                  type="radio"
                  name="vacancy-cover"
                  value={opt.value}
                  checked={cover === opt.value}
                  onChange={() => { setCover(opt.value); if (opt.value === 'replace' && !replacement) setPicking(true) }}
                />
                <span className="flex min-w-0 flex-col">
                  <span>{opt.label}</span>
                  <span className="text-xs text-ink-muted">{opt.hint}</span>
                </span>
                {opt.value === 'replace' && replacement && (
                  <button type="button" onClick={() => setPicking(true)} className="ml-auto truncate text-xs font-medium text-accent underline hover:text-accent-dark">
                    {replacementName} · change
                  </button>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-xs text-flagRed" role="alert">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || !canSave} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
