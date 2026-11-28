import { useMemo, useState } from 'react'
import { planWeekendPasteAcrossMonths, formatWeekendRange } from '../../lib/weekendPlanner'

// Copy/Paste's confirmation step, styled like WeekendDriftDetailsModal.jsx
// (fixed inset-0, scrim, items-center, card max-w-lg p-5) — nothing is
// written until this is confirmed. Owns the fill-empty/overwrite mode
// toggle locally and recomputes planWeekendPasteAcrossMonths (the pure
// planner in weekendPlanner.js) on every mode/prop change so the preview counts below
// always match what Confirm would actually do.
export default function WeekendPasteModal({ clipboard, targetMonths, targetLabel, existingByWeekend, activeDoctorIds, saving, onConfirm, onClose }) {
  const [mode, setMode] = useState('fill-empty')
  // Off by default: repeating a weekend is a guess about the rota, and an
  // admin who wants the spare weekend left open should not have to notice
  // and untick something.
  const [fillExtra, setFillExtra] = useState(false)
  const plan = useMemo(
    () => planWeekendPasteAcrossMonths({ sourceMonths: clipboard.months, targetMonths, existingByWeekend, activeDoctorIds, mode, fillExtraTargets: fillExtra }),
    [clipboard, targetMonths, existingByWeekend, activeDoctorIds, mode, fillExtra]
  )
  const inactiveCount = plan.skipped.filter(s => s.reason === 'inactive').length
  const alreadyAssignedCount = plan.skipped.filter(s => s.reason === 'already-assigned').length
  const sourceWeekendCount = clipboard.months.reduce((sum, m) => sum + m.length, 0)
  const targetWeekendCount = targetMonths.reduce((sum, m) => sum + m.length, 0)
  const weekendCount = Math.min(sourceWeekendCount, targetWeekendCount)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center scrim sm:items-center sm:px-4" onClick={onClose}>
      <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-b-none p-5 sm:max-h-[80vh] sm:rounded-b-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Paste {clipboard.sourceLabel} into {targetLabel}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="seg-track mt-4 w-fit">
          <button
            type="button"
            onClick={() => setMode('fill-empty')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'fill-empty' ? 'seg-on' : 'text-ink-light hover:bg-canvas-sunken'}`}
          >
            Fill empty groups only
          </button>
          <button
            type="button"
            onClick={() => setMode('overwrite')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'overwrite' ? 'seg-on' : 'text-ink-light hover:bg-canvas-sunken'}`}
          >
            Overwrite instead
          </button>
        </div>
        {mode === 'overwrite' && (
          <p className="mt-2 text-xs text-flagRed">This removes every existing assignment on each target weekend before pasting — not reversible.</p>
        )}

        {plan.unmatchedSourceCount > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            {clipboard.sourceLabel} has {sourceWeekendCount} weekends, {targetLabel} has {targetWeekendCount} — {' '}
            {plan.unmatchedSourceSaturdays.length > 0
              ? `${plan.unmatchedSourceSaturdays.map(formatWeekendRange).join(', ')} ${plan.unmatchedSourceSaturdays.length === 1 ? 'has' : 'have'} no weekend to paste into and won’t be pasted.`
              : `the last ${plan.unmatchedSourceCount} won’t be pasted.`}
          </p>
        )}
        {plan.unfilledTargets.length > 0 && (
          <div className="mt-3 rounded-lg border border-flagAmber/40 bg-flagAmber-bg/40 px-3 py-2 text-xs text-ink">
            <p>
              {targetLabel} has {targetWeekendCount} weekends, {clipboard.sourceLabel} has {sourceWeekendCount} — {' '}
              {plan.unfilledTargets.map(t => formatWeekendRange(t.saturday)).join(', ')} {plan.unfilledTargets.length === 1 ? 'has' : 'have'} nothing to copy from and will stay empty.
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={fillExtra} onChange={e => setFillExtra(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-line text-accent focus:ring-accent" />
              <span>
                {plan.unfilledTargets.length === 1
                  ? `Fill ${formatWeekendRange(plan.unfilledTargets[0].saturday)} with the same doctors as ${formatWeekendRange(plan.unfilledTargets[0].repeatOf)}`
                  : `Fill ${plan.unfilledTargets.map(t => formatWeekendRange(t.saturday)).join(' and ')} with the same doctors as the weekend two weeks before each`}
              </span>
            </label>
          </div>
        )}

        <p className="mt-3 text-sm text-ink">
          Will add {plan.toInsert.length} assignment{plan.toInsert.length === 1 ? '' : 's'} across {weekendCount + (fillExtra ? plan.unfilledTargets.length : 0)} weekend{weekendCount + (fillExtra ? plan.unfilledTargets.length : 0) === 1 ? '' : 's'}.
          {alreadyAssignedCount > 0 && ` ${alreadyAssignedCount} skipped (already assigned elsewhere that weekend).`}
          {inactiveCount > 0 && ` ${inactiveCount} skipped (no longer active).`}
          {mode === 'overwrite' && plan.toDelete.length > 0 && ` ${plan.toDelete.length} existing assignment${plan.toDelete.length === 1 ? '' : 's'} will be removed first.`}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm(plan)}
            disabled={saving || (plan.toInsert.length === 0 && plan.toDelete.length === 0)}
            className="btn-primary text-sm"
          >
            {saving ? 'Pasting…' : 'Confirm paste'}
          </button>
        </div>
      </div>
    </div>
  )
}
