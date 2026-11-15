import Modal from './Modal'
import Tag from './Tag'
import { generationOutcome, flagTypeLabel } from '../lib/generationReport'
import { formatDayMonthYear, formatTimestampDate } from '../lib/dateRange'

// What the scheduling engine said about the run that produced this draft:
// whether it finished or ran out of time, how short the month is, and —
// the question this exists to answer — which Weekend Planner placements it
// could not honour. Read-only; everything here came back from the engine
// once and is shown as-is (see lib/generationReport.js).
export default function GenerationReportModal({ report, monthLabel, profileMap, onClose }) {
  const outcome = generationOutcome(report.status)
  const s = report.summary || {}
  const missed = s.weekend_planner_missed || []
  const flagTypes = Object.entries(s.red_flags_by_type || {})
  const time = report.savedAt ? new Date(report.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <Modal title="Generation report" onClose={onClose} centered>
      <p className="text-xs text-ink-muted">
        {monthLabel} · generated {formatTimestampDate(report.savedAt)}{time && `, ${time}`}
        {report.excludedCount > 0 && ` · ${report.excludedCount} doctor${report.excludedCount === 1 ? '' : 's'} excluded`}
      </p>

      <div className="mt-3 rounded-lg border border-slate-line p-3">
        <div className="flex items-center gap-2">
          <Tag variant="status" tone={outcome.tone}>{report.status}</Tag>
          <p className="text-sm font-semibold text-ink">{outcome.title}</p>
        </div>
        {outcome.detail && <p className="mt-1.5 text-sm text-ink-light">{outcome.detail}</p>}
      </div>

      <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-line overflow-hidden rounded-lg border border-slate-line text-center">
        {[
          ['Shifts filled', s.total_entries != null ? s.total_entries - (s.total_locums_needed || 0) : '—'],
          ['Locums needed', s.total_locums_needed ?? '—'],
          ['Flagged slots', s.total_red_flags ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="p-3">
            <dt className="text-xs font-medium text-ink-muted">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {flagTypes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
          {flagTypes.map(([type, count]) => (
            <li key={type}>{flagTypeLabel(type)}: {count}</li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-sm font-semibold text-ink">Weekend Planner</h3>
      {missed.length === 0 ? (
        <p className="mt-1 text-sm text-ink-light">Every planned weekend was honoured.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-light">
            {missed.length} planned weekend{missed.length === 1 ? ' was' : 's were'} not rostered. The planner is a very strong preference, not an absolute rule — the engine only breaks it to avoid leaving a required shift empty{report.status === 'FEASIBLE' ? ', or when it runs out of time' : ''}.
          </p>
          <ul className="mt-2 divide-y divide-slate-hairline rounded-lg border border-slate-line">
            {missed.map(m => (
              <li key={`${m.doctor_id}-${m.weekend_saturday}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-ink">{profileMap[m.doctor_id]?.surname || 'Unknown doctor'}</span>
                <span className="text-xs text-ink-muted">weekend of {formatDayMonthYear(m.weekend_saturday)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(s.post_leave_resync_notes > 0 || s.psych_fallback_notes > 0) && (
        <p className="mt-3 text-xs text-ink-muted">
          {[
            s.psych_fallback_notes > 0 && `${s.psych_fallback_notes} psych shift${s.psych_fallback_notes === 1 ? '' : 's'} covered by a fallback doctor`,
            s.post_leave_resync_notes > 0 && `${s.post_leave_resync_notes} back-to-back weekend shift${s.post_leave_resync_notes === 1 ? '' : 's'} allowed after leave`,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      <p className="mt-4 border-t border-slate-line pt-3 text-xs text-ink-muted">
        Saved on this device only. It describes the run above, not edits made to the draft since.
      </p>
    </Modal>
  )
}
