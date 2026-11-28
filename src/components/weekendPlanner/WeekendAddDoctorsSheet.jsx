import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { CATEGORY_GROUPS, resolveWeekendCategoryForDoctor, formatWeekendRange } from '../../lib/weekendPlanner'
import Tag from '../Tag'

function XIcon(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

// Part 5's doctor picker, rebuilt: a category dropdown (switchable, not a
// fixed groupKey passed in from outside) plus a checkbox multi-select list,
// so opening it from either the card-level "Add doctor" button (no category
// preselected — the admin picks one) or a specific role row's "Open"/"+"
// (that row's category preselected, still changeable) lands on the same
// sheet. Multi-select matters because a category routinely holds several
// doctors at once (3-4 MOs on rotation together): the original one-tap-then-
// close picker meant re-opening it once per name. Candidates still come from
// the date-aware resolveWeekendCategoryForDoctor (Part 10), not a static
// category field, so a copied-over EC/OT rotation is reflected immediately.
// Eligibility filtering is limited to "not already assigned this weekend"
// and "no approved weekend exception for it" — the latter because an
// approved exception is a decision that this doctor is not working this
// weekend, so offering them would invite an assignment contradicting it.
// Other conflicts (leave overlaps, hour caps) remain out of scope, already
// flagged as separate future work.
export default function WeekendAddDoctorsSheet({ saturday, initialGroupKey, doctors, assignedIds, excusedIds, rotationsByDoctorId, swapping, onAdd, onRemove, onClose }) {
  const [groupKey, setGroupKey] = useState(initialGroupKey)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const excused = excusedIds ?? new Set()
  const group = CATEGORY_GROUPS.find(g => g.key === groupKey)
  // Excused doctors hold an APPROVED weekend exception for this weekend, so
  // they are not rosterable on it — offering them here would invite an
  // assignment that contradicts a decision an admin has already made.
  const eligible = doctors.filter(d => !assignedIds.has(d.id) && !excused.has(d.id))
  const candidates = eligible
    .map(d => ({ doctor: d, ...resolveWeekendCategoryForDoctor({ doctor: d, targetDate: saturday, rotationsByDoctorId }) }))
    .filter(r => r.groupKey === groupKey)
    .sort((a, b) => a.doctor.surname.localeCompare(b.doctor.surname))

  // How many of THIS category were withheld — a name vanishing from a
  // picker with no explanation reads as a bug, and the admin would
  // otherwise have to go hunting for why.
  const excusedInGroup = doctors
    .filter(d => excused.has(d.id) && !assignedIds.has(d.id))
    .filter(d => resolveWeekendCategoryForDoctor({ doctor: d, targetDate: saturday, rotationsByDoctorId }).groupKey === groupKey)
    .length

  function changeGroup(key) {
    setGroupKey(key)
    setSelectedIds(new Set())
  }
  function toggle(doctorId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(doctorId)) next.delete(doctorId)
      else next.add(doctorId)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center scrim sm:items-center sm:px-4" onClick={onClose}>
      <div className="card flex w-full max-w-sm flex-col rounded-b-none p-4 sm:max-h-[75vh] sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ink">{swapping ? `Swap ${swapping} — ` : 'Add doctor — '}{formatWeekendRange(saturday)}</h2>
          <button type="button" onClick={onClose} className="btn-close h-8 w-8 flex-shrink-0 text-ink-muted" aria-label="Close">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3">
          <label htmlFor="add-doctor-category" className="label-text">Category</label>
          <select
            id="add-doctor-category"
            className="input-field mt-1 w-full text-sm"
            value={groupKey}
            onChange={e => changeGroup(e.target.value)}
          >
            {CATEGORY_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>

        <div className="mt-3 max-h-[50vh] flex-1 divide-y divide-slate-line overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">No eligible doctors available for {group?.label}.</p>
          ) : candidates.map(({ doctor, resolved }) => (
            <label
              key={doctor.id}
              className="flex w-full cursor-pointer items-center justify-between gap-2 px-1 py-2.5 text-left text-sm text-ink hover:bg-canvas-sunken"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(doctor.id)}
                  onChange={() => toggle(doctor.id)}
                  className="h-4 w-4 rounded border-slate-line text-accent focus:ring-accent"
                />
                {doctor.name} {doctor.surname}
              </span>
              {!resolved && <Tag variant="status" tone="warning">Needs rotation record</Tag>}
            </label>
          ))}
        </div>

        {excusedInGroup > 0 && (
          <p data-testid="excused-note" className="mt-2 text-xs text-ink-muted">
            {excusedInGroup} {excusedInGroup === 1 ? 'doctor is' : 'doctors are'} not listed — approved weekend off for this weekend.
          </p>
        )}

        <button
          type="button"
          onClick={() => onAdd(groupKey, [...selectedIds])}
          disabled={selectedIds.size === 0}
          className="btn-primary mt-3 w-full text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {swapping ? `Swap for ${selectedIds.size > 0 ? selectedIds.size : ''} doctor${selectedIds.size === 1 ? '' : 's'}` : `Add ${selectedIds.size > 0 ? selectedIds.size : ''} doctor${selectedIds.size === 1 ? '' : 's'}`}
        </button>
        {/* Tapping an assigned name opens this same sheet in swap mode, so
            the remove action lives here too — one tap to swap or remove,
            matching the desktop cell editor. */}
        {swapping && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="btn-secondary mt-2 w-full text-sm text-flagRed"
          >
            <Trash2 className="h-4 w-4" /> Remove from this weekend
          </button>
        )}
      </div>
    </div>
  )
}
