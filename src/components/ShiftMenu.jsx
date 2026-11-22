import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ActionSheet, ActionSheetButton } from './ActionSheet'
import DoctorDropdown from './DoctorDropdown'
import NewLocumModal from './NewLocumModal'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useDismissablePopover } from '../lib/useDismissablePopover'
import { computeAnchoredPosition } from '../lib/popoverPosition'
import { locumDisplayName } from '../lib/locumCover'
import { leaveQuestion, reinstateBlocker, shiftMenuKind } from '../lib/rosterEdits'
import { labelForShiftCode } from '../lib/shiftLabels'
import { shortDate } from '../lib/reviewLog'
import { LEAVE_TYPE_LABELS } from '../lib/leaveRequests'

// The one shift menu. Opens from any tap on a name or slot while editing
// and decides, from what was tapped, which menu to show (see shiftMenuKind
// below — the table in the spec). A bottom sheet on a phone; a panel
// anchored beside the tapped cell from md up. Every version ends with
// "Close — no change".
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

function Section({ title, children }) {
  return (
    <div className="py-1">
      {title && <p className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</p>}
      {children}
    </div>
  )
}

// A row: label on one line, the consequence underneath.
function Item({ label, hint, onClick, danger = false, disabled = false }) {
  return (
    <ActionSheetButton onClick={onClick} danger={danger} disabled={disabled}>
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        {hint && <span className={`text-xs font-normal ${danger ? 'text-flagRed/80' : 'text-ink-muted'}`}>{hint}</span>}
      </span>
    </ActionSheetButton>
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
  const style = anchorRect ? computeAnchoredPosition(anchorRect, width, { maxHeight: 420 }) : { left: 16, top: 80 }
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{ ...style, width }}
      className="card fixed z-50 flex max-h-[420px] flex-col border-edge p-2 shadow-raised"
    >
      <div className="flex flex-shrink-0 items-start justify-between gap-2 px-3 pb-1 pt-2">
        <p className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="btn-close h-6 w-6 text-ink-muted">×</button>
      </div>
      <div className="min-h-0 divide-y divide-slate-line overflow-y-auto">{children}</div>
    </div>,
    document.body
  )
}

export default function ShiftMenu({
  entry, date, shiftCode, rosterStatus, anchorRect = null,
  entries, profiles, displayNames, leaveByProfile = {}, locums = [], contacts = [], adminId,
  nameOf, hasOpenAdvert = false,
  onVacancy, onAssign, onRemoveEntry, onRemoveLocum, onAddCover, onRemoveSlot, onAdvertise, onUnadvertise, onReinstate, onNewLocum,
  onClose,
}) {
  const wide = useIsDesktop(768)
  const kind = shiftMenuKind(entry, rosterStatus)
  const [step, setStep] = useState(null) // null | 'pick' | 'pick-cover' | 'confirm-*' | 'leave'
  const [search, setSearch] = useState('')
  const [addingLocum, setAddingLocum] = useState(false)

  // A doctor on a published roster goes straight to the vacancy form; the
  // page owns that dialog.
  useEffect(() => {
    if (kind === 'vacancy') { onVacancy(entry); onClose() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, [])
  if (kind === 'vacancy') return null

  const vacatedName = entry?.vacated_profile_id ? nameOf(entry.vacated_profile_id) : null
  const holder = entry?.profile_id && !entry.is_locum ? nameOf(entry.profile_id) : null
  const locumName = entry?.is_locum ? locumDisplayName(entry.locum_name) : ''
  const reasonText = entry?.vacated_reason ? REASON_LABELS[entry.vacated_reason] || entry.vacated_reason : null

  const what = kind === 'add' ? 'Add to shift'
    : kind === 'no-cover' ? `${vacatedName || 'Doctor'} — no cover`
    : kind === 'locum' ? `${locumName || 'Locum'} (locum)`
    : kind === 'slot' || kind === 'slot-vacated' ? 'Open locum slot'
    : holder || 'Doctor'
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
        onClose={() => setStep(null)}
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
        <p className="text-xs text-ink-muted">Keeping it leaves {vacatedName} on the roster over approved leave, shown struck through.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => { onReinstate(entry, { cancelLeave: true }); close() }} className="btn-primary min-h-[44px] flex-1 text-sm md:min-h-0">Cancel the leave</button>
          <button type="button" onClick={() => { onReinstate(entry, { cancelLeave: false }); close() }} className="btn-secondary min-h-[44px] flex-1 text-sm md:min-h-0">Keep the leave</button>
        </div>
        <button type="button" onClick={() => setStep(null)} className="text-sm font-medium text-accent hover:underline">Back</button>
      </div>
    )
  } else {
    const blocker = entry?.vacated_profile_id ? reinstateBlocker({ entry, entries, nameOf }) : null
    const putBack = () => {
      if (blocker) return
      if (entry.vacated_leave_request_id) setStep('leave')
      else { onReinstate(entry, { cancelLeave: false }); close() }
    }
    const putBackItem = entry?.vacated_profile_id && (
      <Section title="The absent doctor">
        <Item
          label={`Put ${vacatedName} back on this shift`}
          hint={blocker || (entry.vacated_leave_request_id ? `Their ${(LEAVE_TYPE_LABELS[leaveByProfile?.[entry.vacated_profile_id]?.find(r => r[3] === entry.vacated_leave_request_id)?.[2]] || 'leave').toLowerCase()} is linked; you will be asked about it` : 'Restores them and clears the absence')}
          onClick={putBack}
          disabled={Boolean(blocker)}
        />
      </Section>
    )

    body = (
      <>
        {kind === 'add' && (
          <Section>
            <Item label="Add a doctor or locum" hint="Pick who works this shift" onClick={() => setStep('pick')} />
          </Section>
        )}
        {kind === 'draft-doctor' && (
          <>
            <Section>
              <Item label="Replace with…" hint="Pick who takes the shift instead" onClick={() => setStep('pick')} />
            </Section>
            <Section>
              <Item danger label={`Remove ${holder} from this shift`} hint="The shift is left empty" onClick={() => setStep('confirm-remove')} />
            </Section>
          </>
        )}
        {kind === 'slot-vacated' && (
          <>
            <Section title="The locum slot">
              <Item label="Fill with a doctor or locum" hint={`${vacatedName} stays struck through beside them`} onClick={() => setStep('pick')} />
              {hasOpenAdvert
                ? <Item label="Stop advertising" hint="The advert is set to cancelled; the slot stays open" onClick={() => { onUnadvertise(entry); close() }} />
                : <Item label="Advertise to locums" hint="Locums with an account can claim it" onClick={() => { onAdvertise(entry); close() }} />}
            </Section>
            <Section>
              <Item danger label="Remove the locum slot" hint={`${vacatedName} stays struck through; the shift runs short`} onClick={() => setStep('confirm-slot')} />
            </Section>
            {putBackItem}
          </>
        )}
        {kind === 'slot' && (
          <>
            <Section>
              <Item label="Fill with a doctor or locum" hint="Pick who works this shift" onClick={() => setStep('pick')} />
              {hasOpenAdvert
                ? <Item label="Stop advertising" hint="The advert is set to cancelled; the slot stays open" onClick={() => { onUnadvertise(entry); close() }} />
                : <Item label="Advertise to locums" hint="Locums with an account can claim it" onClick={() => { onAdvertise(entry); close() }} />}
            </Section>
            <Section>
              <Item danger label="Remove this slot" hint="The empty slot is deleted; nothing else changes" onClick={() => setStep('confirm-remove')} />
            </Section>
          </>
        )}
        {kind === 'locum' && (
          <>
            <Section>
              <Item label="Change cover" hint="Pick someone else for this shift" onClick={() => setStep('pick')} />
            </Section>
            <Section>
              <Item
                danger
                label={`Remove ${locumName}`}
                hint={entry.vacated_profile_id ? `The slot opens again as [ ]; ${vacatedName} stays struck through` : 'The shift is left empty'}
                onClick={() => setStep('confirm-remove')}
              />
            </Section>
            {putBackItem}
          </>
        )}
        {kind === 'no-cover' && (
          <>
            <Section title="Add cover">
              <Item label="Replace now" hint="A doctor or locum takes the shift" onClick={() => setStep('pick-cover')} />
              <Item label="Advertise for a locum" hint="Opens a [ ] slot and offers it to locums" onClick={() => { onAddCover(entry, 'advertise'); close() }} />
              <Item label="Open slot, don't advertise" hint="Opens a [ ] slot to fill later" onClick={() => { onAddCover(entry, 'open'); close() }} />
            </Section>
            {putBackItem}
          </>
        )}
        <Section>
          <ActionSheetButton onClick={close}>Close — no change</ActionSheetButton>
        </Section>
      </>
    )
  }

  if (wide) {
    return <AnchoredPanel anchorRect={anchorRect} title={title} onClose={close}>{body}</AnchoredPanel>
  }
  return <ActionSheet title={title} onClose={close}>{body}</ActionSheet>
}
