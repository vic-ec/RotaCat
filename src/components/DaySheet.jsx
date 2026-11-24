import { useId, useState } from 'react'
import { Info } from 'lucide-react'
import Modal from './Modal'
import { DayStepper } from './DateStepper'
import { formatWeekdayDate } from '../lib/dateRange'

// One day's details as a phone bottom sheet — the one shape Team Leave's
// month view and the Annual and Special planners' selected day share: a
// count beside a ‹ date › stepper in the header, the day's content in a
// body that scrolls, and (optionally) an action pinned at the bottom.
//
// It holds one short height while stepping, so the arrows stay under the
// finger and the top of the month grid stays in view behind it.
export default function DaySheet({ date, onStep, onClose, count, footer, children }) {
  return (
    <Modal
      title={formatWeekdayDate(date)}
      header={(
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {count}
          <div className="min-w-0 flex-1"><DayStepper date={date} onStep={onStep} /></div>
        </div>
      )}
      heightClassName="h-[42dvh] min-h-[260px]"
      onClose={onClose}
      footer={footer}
    >
      {children}
    </Modal>
  )
}

// The header's count: a number over a one-word label ("3 AWAY", "3/3
// SLOTS"). `title` says it in full; `toneClassName` tints the box (a day's
// capacity colour), otherwise a plain bordered box.
export function DayCount({ value, label, title, toneClassName = 'border border-slate-line', valueClassName = 'text-ink' }) {
  return (
    <span
      title={title}
      className={`flex h-[30px] min-w-[40px] flex-shrink-0 flex-col items-center justify-center rounded-md px-1.5 leading-none ${toneClassName}`}
    >
      <span className={`text-sm font-bold leading-none ${valueClassName}`}>{value}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-muted">{label}</span>
    </span>
  )
}

// A day's status in one line (and an optional small second line), with
// the explanation behind an (i) that opens in place — not an anchored
// popover, which would sit outside the sheet and close it when tapped.
export function DayStatus({ toneClassName, textClassName, line, subline, info, infoLabel }) {
  const [open, setOpen] = useState(false)
  const infoId = useId()
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ring-inset ${toneClassName}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${textClassName}`}>{line}</p>
          {subline && <p className="text-xs text-ink-light">{subline}</p>}
        </div>
        {info && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label={infoLabel}
            aria-expanded={open}
            aria-controls={infoId}
            title={infoLabel}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-canvas-raised/70 ${textClassName}`}
          >
            <Info className="h-4 w-4" />
          </button>
        )}
      </div>
      {info && open && <div id={infoId} className="mt-2 space-y-1.5 border-t border-ink/10 pt-2 text-xs text-ink-light">{info}</div>}
    </div>
  )
}
