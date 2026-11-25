import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ActionSheet } from './ActionSheet'
import ShiftTimesForm from './ShiftTimesForm'
import SwapPicker from './SwapPicker'
import DoctorDropdown from './DoctorDropdown'
import NewLocumModal from './NewLocumModal'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { locumDisplayName } from '../lib/locumCover'
import { describeLinkedLeave, leaveQuestion, reinstateBlocker, shiftMenuKind } from '../lib/rosterEdits'
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

// A choice: a radio on the first line of the label, the consequence under
// it. The form the vacancy dialog uses, so the two menus read alike.
function Choice({ value, label, hint, danger = false, disabled = false, checked, onChange }) {
  return (
    <label className={`flex min-h-[44px] items-start gap-2.5 px-3 py-2 text-sm md:min-h-0 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-canvas-sunken'}`}>
      <input
        type="radio"
        name="shift-menu-choice"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-[3px] h-4 w-4 flex-shrink-0 accent-[rgb(var(--color-accent))]"
      />
      <span className="flex min-w-0 flex-col">
        <span className={`font-medium ${danger ? 'text-flagRed' : 'text-ink'}`}>{label}</span>
        {hint && <span className={`text-xs ${danger ? 'text-flagRed/80' : 'text-ink-muted'}`}>{hint}</span>}
      </span>
    </label>
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

// The menu proper: groups of choices, Cancel and Continue.
function Options({ groups, onContinue, onClose }) {
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
        <button type="button" onClick={onClose} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Cancel</button>
        <button type="submit" disabled={!chosen} className={`${chosen?.danger ? 'btn-danger' : 'btn-primary'} min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0`}>Continue</button>
      </div>
    </form>
  )
}

function Confirm({ question, confirmLabel, onConfirm, onBack }) {
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm text-ink">{question}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="btn-secondary min-h-[44px] flex-1 text-sm md:min-h-0">Back</button>
        <button type="button" onClick={onConfirm} className="btn-danger min-h-[44px] flex-1 text-sm md:min-h-0">{confirmLabel}</button>
      </div>
    </div>
  )
}

// The panel from md up: the sheet's card, placed beside the cell.
function AnchoredPanel({ anchorRect, title, onClose, children }) {
  const ref = useRef(null)
  useDismissablePopover(true, onClose, ref)
  const width = 320
  const style = anchorRect ? computeAnchoredPosition(anchorRect, width, { maxHeight: 520 }) : { left: 16, top: 80 }
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{ ...style, width }}
      className="card fixed z-50 flex max-h-[calc(100vh-24px)] flex-col border-edge p-2 shadow-raised"
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
  // { exists } when a late arrival can be logged against this shift (see
  // the page's lateOptionFor), else null.
  lateArrival = null, onLateArrival,
  onClose,
}) {
  const wide = useIsDesktop(768)
  const kind = shiftMenuKind(entry, rosterStatus)
  const [step, setStep] = useState(null) // null | 'pick' | 'pick-cover' | 'confirm-*' | 'leave'
  const [search, setSearch] = useState('')
  const [addingLocum, setAddingLocum] = useState(false)

  const vacatedName = entry?.vacated_profile_id ? nameOf(entry.vacated_profile_id) : null
  const holder = entry?.profile_id && !entry.is_locum ? nameOf(entry.profile_id) : null
  const locumName = entry?.is_locum ? locumDisplayName(entry.locum_name) : ''
  const reasonText = entry?.vacated_reason ? REASON_LABELS[entry.vacated_reason] || entry.vacated_reason : null

  const what = kind === 'add' ? 'Add to shift'
    : kind === 'no-cover' ? `${vacatedName || 'Doctor'} — no cover`
    : kind === 'locum' ? `${locumName || 'Locum'} (locum)`
    : kind === 'slot' || kind === 'slot-vacated' ? 'Open locum slot'
    : holder || 'Doctor'
  const timesNow = adjustedTimesLabel(entry)
  const title = `${what} · ${shortDate(date)} · ${labelForShiftCode(shiftCode)}${vacatedName && kind !== 'no-cover' ? ` · covering ${vacatedName} (${reasonText})` : ''}`

  const close = () => onClose()

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
          <button type="button" onClick={() => { onReinstate(entry, { cancelLeave: true }); close() }} className="btn-primary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Cancel all of it</button>
          <button type="button" onClick={() => { onReinstate(entry, { cancelLeave: false }); close() }} className="btn-secondary min-h-[44px] flex-1 whitespace-nowrap text-sm md:min-h-0">Keep the other days</button>
        </div>
        <button type="button" onClick={() => setStep(null)} className="text-sm font-medium text-accent hover:underline">Back</button>
      </div>
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
    const putBackGroup = entry?.vacated_profile_id && {
      title: 'The absent doctor',
      choices: [{
        value: 'put-back',
        label: `Put ${vacatedName} back on this shift`,
        hint: blocker || (linkedLeave
          ? (linkedLeave.multiDay ? `Their ${linkedLeave.type} runs ${linkedLeave.dates}; you choose what happens to it` : `Their ${linkedLeave.type} for that day is cancelled too`)
          : 'Restores them and clears the absence'),
        disabled: Boolean(blocker),
      }],
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
    const advertChoice = hasOpenAdvert
      ? { value: 'unadvertise', label: 'Stop advertising', hint: 'The advert is set to cancelled; the slot stays open' }
      : { value: 'advertise', label: 'Advertise to locums', hint: 'Locums with an account can claim it' }

    const groups = {
      add: [{ choices: [{ value: 'pick', label: 'Add a doctor or locum', hint: 'Pick who works this shift' }] }],
      vacancy: [
        { choices: [
          { value: 'vacancy', label: `Take ${holder} off this shift`, hint: 'Say why, and what happens to the shift' },
          swapChoice,
          timesChoice,
        ].filter(Boolean) },
        lateGroup,
      ],
      'draft-doctor': [
        { choices: [{ value: 'pick', label: 'Replace with…', hint: 'Pick who takes the shift instead' }, swapChoice, timesChoice].filter(Boolean) },
        { choices: [{ value: 'confirm-remove', label: `Remove ${holder} from this shift`, hint: 'The shift is left empty', danger: true }] },
      ],
      'slot-vacated': [
        { title: 'The locum slot', choices: [
          { value: 'pick', label: 'Fill with a doctor or locum', hint: `${vacatedName} stays struck through beside them` },
          advertChoice,
        ] },
        { choices: [{ value: 'confirm-slot', label: 'Remove the locum slot', hint: `${vacatedName} stays struck through; the shift runs short`, danger: true }] },
        putBackGroup,
      ],
      slot: [
        { choices: [{ value: 'pick', label: 'Fill with a doctor or locum', hint: 'Pick who works this shift' }, advertChoice] },
        { choices: [{ value: 'confirm-remove', label: 'Remove this slot', hint: 'The empty slot is deleted; nothing else changes', danger: true }] },
      ],
      locum: [
        { choices: [{ value: 'pick', label: 'Change cover', hint: 'Pick someone else for this shift' }, timesChoice] },
        { choices: [{
          value: 'confirm-remove', label: `Remove ${locumName}`, danger: true,
          hint: entry?.vacated_profile_id ? `The slot opens again as [ ]; ${vacatedName} stays struck through` : 'The shift is left empty',
        }] },
        lateGroup,
        putBackGroup,
      ],
      'no-cover': [
        { title: 'Add cover', choices: [
          { value: 'pick-cover', label: 'Replace now', hint: 'A doctor or locum takes the shift' },
          { value: 'add-advertise', label: 'Advertise for a locum', hint: 'Opens a [ ] slot and offers it to locums' },
          { value: 'add-open', label: "Open slot, don't advertise", hint: 'Opens a [ ] slot to fill later' },
        ] },
        putBackGroup,
      ],
    }[kind].filter(Boolean)

    const run = chosen => {
      switch (chosen.value) {
        case 'pick': case 'pick-cover': case 'confirm-remove': case 'confirm-slot': case 'times': case 'swap': setStep(chosen.value); break
        case 'vacancy': onVacancy(entry); close(); break
        case 'late': onLateArrival(entry); close(); break
        case 'advertise': onAdvertise(entry); close(); break
        case 'unadvertise': onUnadvertise(entry); close(); break
        case 'add-advertise': onAddCover(entry, 'advertise'); close(); break
        case 'add-open': onAddCover(entry, 'open'); close(); break
        case 'put-back':
          // A one-day leave goes with the put-back; a longer one asks.
          if (linkedLeave?.multiDay) setStep('leave')
          else { onReinstate(entry, { cancelLeave: Boolean(linkedLeave) }); close() }
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
