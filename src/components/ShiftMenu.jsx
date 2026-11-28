import { useRef, useState } from 'react'
import { Info } from 'lucide-react'
import InfoPopover from './InfoPopover'
import DateFieldButton from './DateFieldButton'
import SelectMenu from './SelectMenu'
import { VACANCY_LEAVE_TYPE_OPTIONS } from '../lib/rosterVacancy'
import { createPortal } from 'react-dom'
import { ActionSheet } from './ActionSheet'
import ShiftTimesForm from './ShiftTimesForm'
import SwapPicker from './SwapPicker'
import { LEAVE_TYPE_LABELS } from '../lib/leaveRequests'
import DoctorDropdown from './DoctorDropdown'
import NewLocumModal from './NewLocumModal'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { locumDisplayName } from '../lib/locumCover'
import { describeLinkedLeave, leaveQuestion, possessive, reinstateBlocker, shiftMenuKind } from '../lib/rosterEdits'
import { labelForShiftCode } from '../lib/shiftLabels'
import { adjustedTimesLabel } from '../lib/shiftTimes'
import { shortDate } from '../lib/reviewLog'

// The one shift menu. Opens from any tap on a name or slot while editing
// and decides, from what was tapped, which menu to show (see shiftMenuKind
// below — the table in the spec). A bottom sheet on a phone; a panel
// anchored beside the tapped cell from md up. Every version ends with
// Cancel.
//
// The menu only DECIDES. The writes are the page's (see lib/rosterEdits.js);
// each handler here hands back what was chosen and closes. The vacancy
// form (a doctor coming off a published shift) is its own component and is
// opened by the page when this returns kind 'vacancy'.
//
// Labels: every remove names the thing removed; the old anonymous remove label is
// retired. Destructive items sit in their own section under a line saying
// what the consequence is.

const REASON_LABELS = { leave: 'leave', swap: 'swap', no_show: 'no-show', other: 'other reason' }

// A choice: a radio and its label on one line; what it does is behind an
// (i) at the right of the row (tap, or hover on a desktop), so the menu
// stays short enough to fit on screen. The (i) sits outside the label so
// opening it never picks the choice.
function Choice({ value, label, hint, danger = false, disabled = false, checked, onChange }) {
  return (
    <div className={`flex items-center ${disabled ? 'opacity-50' : ''}`}>
      <label className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-sm md:min-h-[36px] ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-canvas-sunken'}`}>
        <input
          type="radio"
          name="shift-menu-choice"
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onChange(value)}
          className="h-4 w-4 flex-shrink-0 accent-[rgb(var(--color-accent))]"
        />
        <span className={`min-w-0 font-medium ${danger ? 'text-flagRed' : 'text-ink'}`}>{label}</span>
      </label>
      {hint && (
        <span className="flex-shrink-0 pr-1" data-testid="choice-info">
          <InfoPopover icon={<Info className="h-4 w-4" aria-hidden="true" />} title={label} label={`About ${label}`} hover>
            <p className="text-sm text-ink">{hint}</p>
          </InfoPopover>
        </span>
      )}
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div className="py-1">
      {title && <p className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>}
      {children}
    </div>
  )
}

// The menu proper: groups of choices, then Continue and Cancel (the
// action first, as in every window's footer).
function Options({ groups, onContinue, onClose, closeLabel = 'Cancel' }) {
  const [choice, setChoice] = useState('')
  const chosen = groups.flatMap(g => g.choices).find(c => c.value === choice)
  return (
    <form onSubmit={e => { e.preventDefault(); if (chosen) onContinue(chosen) }} data-testid="shift-menu-options">
      <div className="divide-y divide-slate-line">
        {groups.map((g, i) => (
          <Group key={g.title || i} title={g.title}>
            {g.choices.map(c => <Choice key={c.value} {...c} checked={choice === c.value} onChange={setChoice} />)}
          </Group>
        ))}
      </div>
      <div className="flex flex-nowrap gap-2 border-t border-slate-line px-3 pb-1 pt-3">
        <button type="submit" disabled={!chosen} className={`${chosen?.danger ? 'btn-danger' : 'btn-primary'} min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0`}>Continue</button>
        <button type="button" onClick={onClose} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">{closeLabel}</button>
      </div>
    </form>
  )
}

function Confirm({ question, confirmLabel, onConfirm, onBack }) {
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm text-ink">{question}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm} className="btn-danger min-h-[44px] flex-1 text-sm md:min-h-0">{confirmLabel}</button>
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 text-sm md:min-h-0">Back</button>
      </div>
    </div>
  )
}

// What the absent doctor's reason says now, for "Change why … is off".
function absenceReasonText(entry, activeLeave) {
  const r = entry?.vacated_reason
  if (r === 'leave') {
    if (!activeLeave) return entry.vacated_leave_request_id ? 'leave (since cancelled)' : 'leave'
    return (LEAVE_TYPE_LABELS[activeLeave.leave_type] || 'leave').toLowerCase()
  }
  return { swap: 'swap', no_show: 'no-show', other: 'other reason' }[r] || 'not recorded'
}

// "Move <locum> to another shift": a day of the month and one of its shifts.
function MoveCoverForm({ entry, shiftCode, who, shiftsForDate, onSave, onBack }) {
  const [date, setDate] = useState(entry.date)
  const [code, setCode] = useState('')
  const options = shiftsForDate(date)
    .filter(o => !(date === entry.date && o.code === shiftCode))
    .map(o => ({ value: o.code, label: o.label }))
  return (
    <div className="space-y-3 p-3" data-testid="move-cover-form">
      <p className="text-sm text-ink">Move {who} to:</p>
      <DateFieldButton id="move-cover-date" label="Day" fullWidth value={date} onChange={v => { if (v) { setDate(v); setCode('') } }} />
      <SelectMenu id="move-cover-shift" value={code} onChange={setCode} options={options} placeholder="Choose a shift…" />
      <p className="text-xs text-ink-muted">This shift reopens as [ ], with the absent doctor still struck through.</p>
      <div className="flex flex-nowrap gap-2">
        <button type="button" disabled={!code} onClick={() => onSave({ date, code })} className="btn-primary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Move</button>
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Back</button>
      </div>
    </div>
  )
}

// "Move <doctor> to another shift": a day from the roster's month (a strip,
// starting on the shift's own day), one of that day's shifts with who is
// on it, and what becomes of the slot left behind. `occupants(date, code)`
// names who is on a shift; `warnings(date, code)` the rule checks
// (rest after a night, leave), shown as notes, never blocking.
function dayList(from, to) {
  const out = []
  const d = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function MoveForm({ entry, shiftCode, who, monthStart, monthEnd, shiftsForDate, occupants, warnings, onSave, onBack }) {
  const [date, setDate] = useState(entry.date)
  const [code, setCode] = useState('')
  const [leave, setLeave] = useState('close')
  const stripRef = useRef(null)
  const days = monthStart && monthEnd ? dayList(monthStart, monthEnd) : [entry.date]
  const shifts = shiftsForDate(date).filter(o => !(date === entry.date && o.code === shiftCode))
  const notes = code ? warnings(date, code) : []
  return (
    <div className="space-y-2 p-3" data-testid="move-form">
      <p className="text-xs font-semibold text-ink-muted">Day</p>
      <div ref={stripRef} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Day">
        {days.map(d => {
          const dt = new Date(`${d}T00:00:00`)
          const on = d === date
          const weekend = dt.getDay() === 0 || dt.getDay() === 6
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={shortDate(d)}
              ref={el => { if (el && d === entry.date && !stripRef.current?.dataset.scrolled) { el.scrollIntoView?.({ inline: 'center', block: 'nearest' }); if (stripRef.current) stripRef.current.dataset.scrolled = '1' } }}
              onClick={() => { setDate(d); setCode('') }}
              className={`flex w-12 flex-shrink-0 flex-col items-center rounded-lg border py-1 text-[10px] ${
                on ? 'border-accent bg-accent text-on-fill' : `border-slate-line ${weekend ? 'bg-accent-tint' : 'bg-canvas-raised'} text-ink-muted`
              }`}
            >
              {WEEKDAY[dt.getDay()]}
              <span className={`text-sm font-semibold ${on ? 'text-on-fill' : 'text-ink'}`}>{dt.getDate()}</span>
            </button>
          )
        })}
      </div>
      <p className="pt-1 text-xs font-semibold text-ink-muted">Shift on {shortDate(date)}</p>
      <div className="overflow-hidden rounded-lg border border-slate-line" role="radiogroup" aria-label="Shift">
        {shifts.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">No other shift that day.</p>}
        {shifts.map(o => (
          <label key={o.code} className={`flex cursor-pointer items-center gap-2 border-t border-slate-line px-3 py-2 text-sm first:border-t-0 ${code === o.code ? 'bg-accent-tint' : 'hover:bg-canvas-sunken'}`}>
            <input type="radio" name="move-shift" checked={code === o.code} onChange={() => setCode(o.code)} className="h-4 w-4 flex-shrink-0 accent-[rgb(var(--color-accent))]" />
            <span className="w-24 flex-shrink-0 font-medium text-ink">{o.label}</span>
            <span className="min-w-0 truncate text-xs text-ink-muted">{occupants(date, o.code) || 'Nobody yet'}</span>
          </label>
        ))}
      </div>
      {notes.map(n => <p key={n} className="rounded bg-flagAmber-bg px-2 py-1 text-xs text-flagAmber">{n}</p>)}
      <p className="pt-1 text-xs font-semibold text-ink-muted">The slot {who} leaves ({shortDate(entry.date)}, {labelForShiftCode(shiftCode)})</p>
      <div role="radiogroup" aria-label="The slot left behind">
        {[
          { value: 'close', label: 'Close it', hint: 'No one replaces them; the shift runs one short' },
          { value: 'fill', label: 'Fill it with someone', hint: 'Pick a doctor or locum next' },
          { value: 'open', label: 'Open a locum slot', hint: 'A [ ] slot, can be advertised' },
        ].map(c => (
          <label key={c.value} className="flex cursor-pointer items-start gap-2 py-1.5 text-sm">
            <input type="radio" name="move-leave" checked={leave === c.value} onChange={() => setLeave(c.value)} className="mt-[3px] h-4 w-4 flex-shrink-0 accent-[rgb(var(--color-accent))]" />
            <span><span className="font-medium text-ink">{c.label}</span><span className="block text-xs text-ink-muted">{c.hint}</span></span>
          </label>
        ))}
      </div>
      <div className="flex flex-nowrap gap-2 pt-1">
        <button type="button" disabled={!code} onClick={() => onSave({ date, code, leave })} className="btn-primary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">{leave === 'fill' ? 'Next' : 'Move'}</button>
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Back</button>
      </div>
    </div>
  )
}

// "Change why <name> is off": the reason recorded when they came off the
// shift. Moving off an active leave asks whether to cancel that leave too.
const REASON_CHOICES = [
  { value: 'sick', label: 'Sick leave' },
  { value: 'leave', label: 'Other leave' },
  { value: 'swap', label: 'Swap', hint: 'They moved to another shift' },
  { value: 'no_show', label: 'No-show' },
  { value: 'other', label: 'Other reason' },
]
function currentReasonChoice(entry, activeLeave) {
  if (entry.vacated_reason === 'leave') return activeLeave?.leave_type === 'sick' ? 'sick' : activeLeave ? 'leave' : ''
  return entry.vacated_reason || ''
}
function ReasonForm({ entry, name, activeLeave, onSave, onBack }) {
  const [reason, setReason] = useState(() => currentReasonChoice(entry, activeLeave))
  const [leaveType, setLeaveType] = useState(activeLeave && activeLeave.leave_type !== 'sick' ? activeLeave.leave_type : 'family_responsibility')
  const [note, setNote] = useState('')
  const [cancelLeave, setCancelLeave] = useState(false)
  const toLeave = reason === 'sick' || reason === 'leave'
  const canSave = Boolean(reason) && (reason !== 'other' || note.trim().length > 0)
  return (
    <form
      className="space-y-3 p-3"
      data-testid="reason-form"
      onSubmit={e => { e.preventDefault(); if (canSave) onSave({ reason, leaveType, note, cancelLeave: !toLeave && cancelLeave }) }}
    >
      <fieldset>
        <legend className="mb-1 text-sm text-ink">Why is {name} off this shift?</legend>
        {REASON_CHOICES.map(c => (
          <label key={c.value} className="flex min-h-[40px] items-start gap-2.5 py-1 text-sm md:min-h-0">
            <input type="radio" name="absence-reason" value={c.value} checked={reason === c.value} onChange={() => setReason(c.value)} className="mt-[3px] h-4 w-4 accent-[rgb(var(--color-accent))]" />
            <span className="flex flex-col"><span className="font-medium text-ink">{c.label}</span>{c.hint && <span className="text-xs text-ink-muted">{c.hint}</span>}</span>
          </label>
        ))}
      </fieldset>
      {reason === 'leave' && (
        <div>
          <label htmlFor="reason-leave-type" className="label-text">Leave type</label>
          <SelectMenu id="reason-leave-type" value={leaveType} onChange={setLeaveType} options={VACANCY_LEAVE_TYPE_OPTIONS} />
        </div>
      )}
      {toLeave && !activeLeave && <p className="text-xs text-ink-muted">One day of leave is captured for {name} on this date, approved straight away.</p>}
      {!toLeave && (
        <div>
          <label htmlFor="reason-note" className="label-text">Note{reason === 'other' ? ' (required)' : ''}</label>
          <textarea id="reason-note" rows={2} value={note} onChange={e => setNote(e.target.value)} className="input-field w-full" placeholder="Optional — admins only…" />
        </div>
      )}
      {!toLeave && activeLeave && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={cancelLeave} onChange={e => setCancelLeave(e.target.checked)} className="mt-[3px] h-4 w-4 accent-[rgb(var(--color-accent))]" />
          <span>Also cancel {possessive(name)} {(LEAVE_TYPE_LABELS[activeLeave.leave_type] || 'leave').toLowerCase()}</span>
        </label>
      )}
      <div className="flex flex-nowrap gap-2">
        <button type="submit" disabled={!canSave} className="btn-primary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Save</button>
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Back</button>
      </div>
    </form>
  )
}

// The panel from md up: the sheet's card, placed beside the cell.
function AnchoredPanel({ anchorRect, title, onClose, children }) {
  const ref = useRef(null)
  useDismissablePopover(true, onClose, ref)
  const width = 320
  const style = anchorRect ? computeAnchoredPosition(anchorRect, width, { maxHeight: 520 }) : { left: 16, top: 80 }
  // Never taller than the room on its side of the cell, so its top (or
  // foot) can't run off the screen; what doesn't fit scrolls inside it.
  const room = style.top != null ? window.innerHeight - style.top - 12 : window.innerHeight - style.bottom - 12
  style.maxHeight = Math.max(200, room)
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{ ...style, width }}
      className="card fixed z-50 flex flex-col border-edge p-2 shadow-raised"
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-2 px-3 pb-1 pt-2">
        <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide leading-5 text-ink-muted">{title}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="btn-close h-6 w-6 flex-shrink-0 text-ink-muted">×</button>
      </div>
      <div className="min-h-0 overflow-y-auto">{children}</div>
    </div>,
    document.body
  )
}

export default function ShiftMenu({
  entry, date, shiftCode, rosterStatus, anchorRect = null,
  entries, profiles, displayNames, leaveByProfile = {}, locums = [], contacts = [], adminId,
  nameOf, hasOpenAdvert = false, shiftType = null,
  onVacancy, onAssign, onRemoveEntry, onRemoveLocum, onAddCover, onRemoveSlot, onAdvertise, onUnadvertise, onReinstate, onNewLocum, onChangeTimes, onSwap,
  // For Swap: the shift code of any entry, the month's first/last day and
  // whether a doctor is on approved leave on a date.
  shiftCodeOf, monthStart, monthEnd, isOnLeave,
  // The leave behind this shift's absence (CancelLeaveModal's shape), when
  // there is any: offered as "Cancel …'s leave", for leave recorded in error.
  cancelLeaveRequest = null, onCancelLeave,
  // The cover on a shift a doctor came off: take it off (reopen / close),
  // move it to another shift, or change why the doctor is off.
  // shiftsForDate(date) -> [{ code, label }] for that day's columns.
  onRemoveCover, onMoveCover, onChangeReason, shiftsForDate = () => [],
  // { exists } when a late arrival can be logged against this shift (see
  // the page's lateOptionFor), else null.
  lateArrival = null, onLateArrival,
  // Rearranging (not absences): Move to another shift and Remove from this
  // shift. occupants(date, code) / moveWarnings(date, code) feed the Move
  // picker (see MoveForm).
  onMove, onRemoveFromShift, occupants = () => '', moveWarnings = () => [],
  onClose,
}) {
  const wide = useIsDesktop(768)
  const kind = shiftMenuKind(entry, rosterStatus)
  const [step, setStep] = useState(null) // null | 'pick' | 'pick-cover' | 'confirm-*' | 'leave'
  const [search, setSearch] = useState('')
  const [addingLocum, setAddingLocum] = useState(false)
  // Put back from Replace (over the cover) rather than on an empty slot.
  const [putBackOver, setPutBackOver] = useState(false)
  // Move → "Fill it with someone": the chosen day and shift, while the
  // picker for the slot left behind is open.
  const [moveTarget, setMoveTarget] = useState(null)

  const vacatedName = entry?.vacated_profile_id ? nameOf(entry.vacated_profile_id) : null
  const holder = entry?.profile_id && !entry.is_locum ? nameOf(entry.profile_id) : null
  const locumName = entry?.is_locum ? locumDisplayName(entry.locum_name) : ''
  const reasonText = entry?.vacated_reason ? REASON_LABELS[entry.vacated_reason] || entry.vacated_reason : null
  // Someone (a doctor or a named locum) covering a doctor taken off this shift.
  const covered = Boolean(entry?.vacated_profile_id && (holder || locumName))
  const coverLabel = holder || (locumName ? `${locumName} (locum)` : '')

  const what = kind === 'add' ? 'Add to shift'
    : kind === 'no-cover' ? `${vacatedName || 'Doctor'} — no cover`
    : kind === 'locum' ? `${locumName || 'Locum'} (locum)`
    : kind === 'slot' || kind === 'slot-vacated' ? 'Open locum slot'
    : holder || 'Doctor'
  const timesNow = adjustedTimesLabel(entry)
  const title = `${what} · ${shortDate(date)} · ${labelForShiftCode(shiftCode)}${vacatedName && kind !== 'no-cover' ? ` · covering ${vacatedName} (${reasonText})` : ''}`

  const close = () => onClose()

  // Move → fill: who takes the slot the doctor leaves.
  if (step === 'move-fill' && moveTarget) {
    const done = cover => { onMove(entry, { ...moveTarget, leave: 'fill', cover }); close() }
    return (
      <DoctorDropdown
        profiles={profiles.filter(p => p.id !== entry.profile_id)}
        displayNames={displayNames}
        search={search}
        onSearchChange={setSearch}
        onSelect={id => done({ kind: 'doctor', id })}
        locums={locums}
        contacts={contacts}
        onSelectCover={done}
        onNewLocum={null}
        onRemove={null}
        onBack={() => setStep('move')}
        cancelLabel="Cancel"
        onClose={close}
        date={date}
        shiftCode={labelForShiftCode(shiftCode)}
      />
    )
  }

  // The picker inside Replace / Fill: the existing list, with no remove.
  if (step === 'pick' || step === 'pick-cover') {
    const mode = step === 'pick-cover' ? 'replace' : null
    const handleDoctor = id => {
      const cover = { kind: 'doctor', id }
      if (mode) onAddCover(entry, 'replace', cover); else onAssign(cover, entry)
      close()
    }
    const handleCover = cover => {
      if (mode) onAddCover(entry, 'replace', cover); else onAssign(cover, entry)
      close()
    }
    if (addingLocum) {
      return (
        <NewLocumModal
          adminId={adminId}
          onDone={cover => handleCover(cover)}
          onClose={() => setAddingLocum(false)}
        />
      )
    }
    return (
      <DoctorDropdown
        profiles={profiles}
        displayNames={displayNames}
        search={search}
        onSearchChange={setSearch}
        onSelect={handleDoctor}
        locums={locums}
        contacts={contacts}
        onSelectCover={handleCover}
        onNewLocum={() => { if (onNewLocum) { onNewLocum(entry, mode); close() } else setAddingLocum(true) }}
        onRemove={null}
        onBack={() => setStep(null)}
        cancelLabel={holder ? `Cancel — keep ${holder}` : locumName ? `Cancel — keep ${locumName}` : 'Cancel'}
        onClose={close}
        date={date}
        shiftCode={labelForShiftCode(shiftCode)}
      />
    )
  }

  let body
  if (step === 'confirm-remove') {
    const name = holder || (locumName ? `${locumName} (locum)` : 'this slot')
    body = (
      <Confirm
        question={kind === 'locum' && entry.vacated_profile_id
          ? `Remove ${locumName} from this shift? The slot opens again as [ ] and ${vacatedName} stays struck through.`
          : `Remove ${name} from ${shortDate(date)} ${labelForShiftCode(shiftCode)}?`}
        confirmLabel={`Remove ${holder || locumName || 'slot'}`}
        onConfirm={() => { (kind === 'locum' ? onRemoveLocum : onRemoveEntry)(entry); close() }}
        onBack={() => setStep(null)}
      />
    )
  } else if (step === 'confirm-slot') {
    body = (
      <Confirm
        question={`Remove the locum slot? ${vacatedName} stays struck through and the shift runs short.${hasOpenAdvert ? ' The advert is stopped.' : ''}`}
        confirmLabel="Remove the locum slot"
        onConfirm={() => { onRemoveSlot(entry); close() }}
        onBack={() => setStep(null)}
      />
    )
  } else if (step === 'leave') {
    const question = leaveQuestion({ entry, leaveByProfile, nameOf })
    body = (
      <div className="space-y-3 p-3">
        <p className="text-sm text-ink">{question}</p>
        <p className="text-xs text-ink-muted">Keeping the other days leaves the leave on record; {vacatedName} works this shift and stays off the rest.</p>
        <div className="flex flex-nowrap gap-2">
          <button type="button" onClick={() => { onReinstate(entry, { cancelLeave: true, overCover: putBackOver }); close() }} className="btn-primary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Cancel all of it</button>
          <button type="button" onClick={() => { onReinstate(entry, { cancelLeave: false, overCover: putBackOver }); close() }} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Keep the other days</button>
        </div>
        <button type="button" onClick={() => setStep(null)} className="text-sm font-medium text-accent hover:underline">Back</button>
      </div>
    )
  } else if (step === 'replace' || step === 'remove-cover') {
    const covering = coverLabel
    const overBlocker = reinstateBlocker({ entry, entries, nameOf, overCover: true })
    const choices = step === 'replace'
      ? [
          {
            value: 'put-back-over', label: `Put ${vacatedName} back`,
            hint: overBlocker || `${covering} comes off; ${vacatedName} works the shift`, disabled: Boolean(overBlocker),
          },
          { value: 'pick', label: 'Another doctor or locum', hint: `Pick who covers instead of ${covering}` },
        ]
      : [
          { value: 'advertise', label: 'Reopen the slot and advertise it', hint: 'An open [ ] slot, offered to locums' },
          { value: 'open', label: "Reopen the slot, don't advertise", hint: 'An open [ ] slot, filled later by hand' },
          { value: 'close', label: 'Close the shift', hint: `No slot; the shift runs short and ${vacatedName} stays struck through`, danger: true },
        ]
    body = (
      <Options
        groups={[{ choices }]}
        closeLabel="Back"
        onClose={() => setStep(null)}
        onContinue={chosen => {
          if (chosen.value === 'pick') { setStep('pick'); return }
          if (chosen.value === 'put-back-over') {
            const linked = describeLinkedLeave({ entry, leaveByProfile })
            if (cancelLeaveRequest && linked?.multiDay) { setPutBackOver(true); setStep('leave'); return }
            onReinstate(entry, { cancelLeave: Boolean(cancelLeaveRequest), overCover: true }); close(); return
          }
          onRemoveCover(entry, chosen.value); close()
        }}
      />
    )
  } else if (step === 'move') {
    body = (
      <MoveForm
        entry={entry}
        shiftCode={shiftCode}
        who={holder}
        monthStart={monthStart}
        monthEnd={monthEnd}
        shiftsForDate={shiftsForDate}
        occupants={occupants}
        warnings={(d, c) => moveWarnings(entry, d, c)}
        onBack={() => setStep(null)}
        onSave={({ date: targetDate, code, leave }) => {
          if (leave === 'fill') { setMoveTarget({ date: targetDate, code }); setStep('move-fill'); return }
          onMove(entry, { date: targetDate, code, leave }); close()
        }}
      />
    )
  } else if (step === 'remove') {
    body = (
      <Options
        groups={[{ title: `Remove ${holder} — a reshuffle, not an absence`, choices: [
          { value: 'open', label: 'Open the slot to a locum', hint: 'A [ ] slot, filled or advertised later' },
          { value: 'close', label: 'Close the slot', hint: 'Nobody replaces them; the shift runs one short', danger: true },
        ] }]}
        closeLabel="Back"
        onClose={() => setStep(null)}
        onContinue={chosen => { onRemoveFromShift(entry, chosen.value); close() }}
      />
    )
  } else if (step === 'move-cover') {
    body = <MoveCoverForm entry={entry} shiftCode={shiftCode} who={coverLabel} shiftsForDate={shiftsForDate} onBack={() => setStep(null)} onSave={target => { onMoveCover(entry, target); close() }} />
  } else if (step === 'reason') {
    body = (
      <ReasonForm
        entry={entry}
        name={vacatedName}
        activeLeave={cancelLeaveRequest}
        onBack={() => setStep(null)}
        onSave={opts => { onChangeReason(entry, opts); close() }}
      />
    )
  } else if (step === 'swap') {
    body = (
      <SwapPicker
        entry={entry}
        shiftCode={shiftCode}
        entries={entries}
        shiftCodeOf={shiftCodeOf}
        nameOf={nameOf}
        isOnLeave={isOnLeave}
        monthStart={monthStart}
        monthEnd={monthEnd}
        onConfirm={(other, otherCode) => { onSwap(entry, other, otherCode); close() }}
        onBack={() => setStep(null)}
      />
    )
  } else if (step === 'times') {
    body = (
      <ShiftTimesForm
        entry={entry}
        shiftType={shiftType}
        holder={holder || (locumName ? `${locumName} (locum)` : 'they')}
        onSave={({ start, end }) => { onChangeTimes(entry, { start, end }); close() }}
        onBack={() => setStep(null)}
      />
    )
  } else {
    const blocker = entry?.vacated_profile_id ? reinstateBlocker({ entry, entries, nameOf }) : null
    const linkedLeave = describeLinkedLeave({ entry, leaveByProfile })
    // The doctor taken off this shift, whatever now covers it: why they are
    // off (changeable — "sick leave" recorded in error that was really a
    // swap), their leave, and — when nobody covers the shift — Put back.
    // With a cover, putting them back is Replace → "Put <name> back".
    const absentGroup = entry?.vacated_profile_id && {
      title: `The absent doctor (${vacatedName})`,
      choices: [
        !covered && {
          value: 'put-back',
          label: `Put ${vacatedName} back on this shift`,
          hint: blocker || (linkedLeave && cancelLeaveRequest
            ? (linkedLeave.multiDay ? `Their ${linkedLeave.type} runs ${linkedLeave.dates}; you choose what happens to it` : `Their ${linkedLeave.type} for that day is cancelled too`)
            : 'Restores them and clears the absence'),
          disabled: Boolean(blocker),
        },
        onChangeReason && {
          value: 'reason',
          label: `Change why ${vacatedName} is off`,
          hint: `Now: ${absenceReasonText(entry, cancelLeaveRequest)}`,
        },
        cancelLeaveRequest && onCancelLeave && {
          value: 'cancel-leave',
          label: `Cancel ${possessive(vacatedName)} ${(LEAVE_TYPE_LABELS[cancelLeaveRequest.leave_type] || 'leave').toLowerCase()}`,
          hint: 'If it was recorded in error. You choose what happens to the shift.',
        },
      ].filter(Boolean),
    }
    const swapChoice = onSwap && holder && {
      value: 'swap', label: 'Swap with another doctor', hint: 'Each takes the other\'s shift — this day or another',
    }
    const timesChoice = {
      value: 'times',
      label: timesNow ? `Change times (now ${timesNow})` : 'Change times',
      hint: timesNow ? 'Set different hours, or return to the standard times' : 'They worked different hours to the standard shift',
    }
    // Not a roster edit: it opens the late-arrival form, and nothing here
    // joins the undo batches or the change log.
    const lateGroup = lateArrival && onLateArrival && {
      title: 'Attendance',
      choices: [{
        value: 'late',
        label: lateArrival.exists ? 'Edit late arrival' : 'Log late arrival',
        hint: lateArrival.exists ? 'Correct or delete the record for this shift' : 'Record the time they arrived',
      }],
    }
    // Whoever covers a doctor taken off this shift.
    const coverGroup = covered && {
      title: `The cover (${coverLabel})`,
      choices: [
        { value: 'replace', label: `Replace ${coverLabel}`, hint: `Put ${vacatedName} back, or pick someone else` },
        onRemoveCover && { value: 'remove-cover', label: `Remove ${coverLabel}`, hint: 'Reopen the slot, or close the shift' },
        entry.is_locum && onMoveCover && { value: 'move-cover', label: `Move ${coverLabel} to another shift`, hint: 'This slot reopens as [ ]' },
        holder && swapChoice,
        timesChoice,
      ].filter(Boolean),
    }
    // Rearranging a doctor's shift (never an absence: nobody is struck
    // through; the moved or changed name gets the hand-edit marker).
    const rearrangeGroup = holder && {
      title: 'Rearrange',
      choices: [
        onMove && { value: 'move', label: 'Move to another shift', hint: `To another time or day. Nobody takes ${possessive(holder)} place unless you choose` },
        swapChoice,
        { value: 'pick', label: 'Replace with someone else', hint: `Someone else works this shift; ${holder} comes off it` },
        onRemoveFromShift && { value: 'remove', label: 'Remove from this shift', hint: 'A reshuffle, not an absence: close the slot or open it to a locum' },
      ].filter(Boolean),
    }
    const timesGroup = {
      title: lateGroup ? 'Times and attendance' : 'Times',
      choices: [timesChoice, ...(lateGroup ? lateGroup.choices : [])],
    }
    const advertChoice = hasOpenAdvert
      ? { value: 'unadvertise', label: 'Stop advertising', hint: 'The advert is set to cancelled; the slot stays open' }
      : { value: 'advertise', label: 'Advertise to locums', hint: 'Locums with an account can claim it' }

    const leaveLabel = cancelLeaveRequest
      ? (LEAVE_TYPE_LABELS[cancelLeaveRequest.leave_type] || 'leave').toLowerCase()
      : ''
    const cancelLeaveGroup = !entry?.vacated_profile_id && cancelLeaveRequest && onCancelLeave && {
      title: 'The leave',
      choices: [{
        value: 'cancel-leave',
        label: `Cancel ${possessive(cancelLeaveRequest.profiles?.name || 'this doctor')} ${leaveLabel}`,
        hint: 'Only the leave, if it was recorded in error. The shift stays as it is.',
      }],
    }
    const groups = {
      add: [{ choices: [{ value: 'pick', label: 'Add a doctor or locum', hint: 'Pick who works this shift' }] }],
      vacancy: covered ? [coverGroup, lateGroup, absentGroup] : [
        rearrangeGroup,
        { title: 'Absence', choices: [
          { value: 'vacancy', label: 'Mark absent', hint: 'Sick, on leave, no-show… Struck through, with cover' },
        ] },
        timesGroup,
      ],
      'draft-doctor': covered ? [coverGroup, absentGroup] : [rearrangeGroup, timesGroup],
      'slot-vacated': [
        { title: 'The locum slot', choices: [
          { value: 'pick', label: 'Fill with a doctor or locum', hint: `${vacatedName} stays struck through beside them` },
          advertChoice,
        ] },
        { choices: [{ value: 'confirm-slot', label: 'Remove the locum slot', hint: `${vacatedName} stays struck through; the shift runs short`, danger: true }] },
        absentGroup,
      ],
      slot: [
        { choices: [{ value: 'pick', label: 'Fill with a doctor or locum', hint: 'Pick who works this shift' }, advertChoice] },
        { choices: [{ value: 'confirm-remove', label: 'Remove this slot', hint: 'The empty slot is deleted; nothing else changes', danger: true }] },
      ],
      locum: covered ? [coverGroup, lateGroup, absentGroup] : [
        { choices: [{ value: 'pick', label: 'Change cover', hint: 'Pick someone else for this shift' }, timesChoice] },
        { choices: [{ value: 'confirm-remove', label: `Remove ${locumName}`, danger: true, hint: 'The shift is left empty' }] },
        lateGroup,
      ],
      'no-cover': [
        { title: 'Add cover', choices: [
          { value: 'pick-cover', label: 'Replace now', hint: 'A doctor or locum takes the shift' },
          { value: 'add-advertise', label: 'Advertise for a locum', hint: 'Opens a [ ] slot and offers it to locums' },
          { value: 'add-open', label: "Open slot, don't advertise", hint: 'Opens a [ ] slot to fill later' },
        ] },
        absentGroup,
      ],
    }[kind].concat(kind === 'add' || kind === 'slot' ? [] : [cancelLeaveGroup]).filter(Boolean)

    const run = chosen => {
      switch (chosen.value) {
        case 'pick': case 'pick-cover': case 'confirm-remove': case 'confirm-slot': case 'times': case 'swap':
        case 'replace': case 'remove-cover': case 'move-cover': case 'reason': case 'move': case 'remove':
          setStep(chosen.value); break
        case 'vacancy': onVacancy(entry); close(); break
        case 'late': onLateArrival(entry); close(); break
        case 'cancel-leave': onCancelLeave(cancelLeaveRequest); close(); break
        case 'advertise': onAdvertise(entry); close(); break
        case 'unadvertise': onUnadvertise(entry); close(); break
        case 'add-advertise': onAddCover(entry, 'advertise'); close(); break
        case 'add-open': onAddCover(entry, 'open'); close(); break
        case 'put-back':
          // A one-day leave goes with the put-back; a longer one asks.
          // Only leave still active is cancelled (one already cancelled,
          // in Team Leave say, is left alone).
          if (cancelLeaveRequest && linkedLeave?.multiDay) { setPutBackOver(false); setStep('leave') }
          else { onReinstate(entry, { cancelLeave: Boolean(cancelLeaveRequest) }); close() }
          break
        default: break
      }
    }
    body = <Options groups={groups} onContinue={run} onClose={close} />
  }

  if (wide) {
    return <AnchoredPanel anchorRect={anchorRect} title={title} onClose={close}>{body}</AnchoredPanel>
  }
  return <ActionSheet title={title} onClose={close}>{body}</ActionSheet>
}
