import { MONTH_LABELS, quarterLabel, quarterMonthsFrom } from './viewHelpers'

// The admin's clipboard pill: what is copied, and paste/clear for it.
export default function WeekendClipboardBar({ clipboard, viewYear, viewMonth, openMonthPaste, openQuarterPaste, setClipboard }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent-tint px-3 py-2 text-sm text-accent-dark">
      <span>📋 {clipboard.sourceLabel} copied{clipboard.granularity === 'weekend' ? ' — select another weekend, then paste from ⊕ or its ⋮ menu' : ''}</span>
      <div className="flex items-center gap-2">
        {clipboard.granularity === 'month' && (
          <button type="button" onClick={openMonthPaste} className="btn-primary px-3">
            Paste into {MONTH_LABELS[viewMonth - 1]} {viewYear}
          </button>
        )}
        {clipboard.granularity === 'quarter' && (
          <button type="button" onClick={openQuarterPaste} className="btn-primary px-3">
            Paste into {quarterLabel(quarterMonthsFrom(viewYear, viewMonth))}
          </button>
        )}
        <button type="button" onClick={() => setClipboard(null)} className="text-xs font-medium text-accent-dark underline hover:no-underline">
          Clear
        </button>
      </div>
    </div>
  )
}
