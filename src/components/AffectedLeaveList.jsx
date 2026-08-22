import { useState } from 'react'
import SectionLabel from './SectionLabel'
import { parseLocalDate } from '../lib/dateRange'
import { REVIEW_STATUS_LABELS } from '../lib/statusLabels'

const CATEGORY_LABELS = {
  MO:         'MO',
  Registrar:  'Registrar',
  Intern:     'Intern',
  Consultant: 'Consultant',
  Locum:      'Locum',
}

const STATUS_LABEL = { approved: 'Approved', pending: REVIEW_STATUS_LABELS.pending }
const STATUS_PILL_CLASS = { approved: 'bg-success-bg text-success', pending: 'bg-flagAmber-bg text-flagAmber' }

const VISIBLE_LIMIT = 4

// "8–16 Oct" (same month) or "28 Oct – 3 Nov" (crosses a month) — a
// compact secondary-line date range, distinct from LeaveRequestSummary's
// full natural-language sentence (which has room to spell out weekday/year;
// this is a supporting line in a dense list, so it drops both).
function shortDateRange(dateFrom, dateTo) {
  const from = parseLocalDate(dateFrom)
  const to = parseLocalDate(dateTo)
  const dayNum = d => d.getDate()
  const monthAbbr = d => d.toLocaleDateString('en-GB', { month: 'short' })
  if (dateFrom === dateTo) return `${dayNum(from)} ${monthAbbr(from)}`
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${dayNum(from)}–${dayNum(to)} ${monthAbbr(from)}`
  }
  return `${dayNum(from)} ${monthAbbr(from)} – ${dayNum(to)} ${monthAbbr(to)}`
}

// "Who is already away" — the people-affected context the old design left
// the admin to work out for themselves. `entries` is a
// fetchAffectedLeaveForRequest() result: [{ id, name, category, status,
// dateFrom, dateTo }], already scoped (date range + shared capacity pool
// where one applies) by the caller. `emptyMessage` lets the caller phrase
// the empty state to match whether a pool was actually being scoped
// against ("No overlapping leave in this pool.") or not ("...in this
// period.").
export default function AffectedLeaveList({ entries, loading, emptyMessage }) {
  const [showAll, setShowAll] = useState(false)

  const approvedCount = entries.filter(e => e.status === 'approved').length
  const pendingCount = entries.filter(e => e.status === 'pending').length
  const summary = entries.length > 0
    ? [approvedCount > 0 && `${approvedCount} approved`, pendingCount > 0 && `${pendingCount} pending`].filter(Boolean).join(' · ')
    : null

  const visible = showAll ? entries : entries.slice(0, VISIBLE_LIMIT)
  const hiddenCount = entries.length - visible.length

  return (
    <div>
      <SectionLabel>Who is already away</SectionLabel>
      {summary && <p className="-mt-1 mb-2 text-xs text-ink-muted">{summary}</p>}

      {loading ? (
        <p className="text-xs text-ink-muted">Checking who else is away…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-ink-muted">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-slate-line rounded-lg border border-slate-line">
          {visible.map(entry => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className={`inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_PILL_CLASS[entry.status]}`}>
                {entry.name.split(' ').slice(-1)[0]} · {STATUS_LABEL[entry.status]}
              </span>
              <span className="min-w-0 truncate text-xs text-ink-muted">
                {entry.category && `${CATEGORY_LABELS[entry.category] || entry.category} · `}
                {shortDateRange(entry.dateFrom, entry.dateTo)}
              </span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="block w-full px-3 py-2 text-left text-xs font-medium text-accent hover:underline"
            >
              View all affected staff ({entries.length})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
