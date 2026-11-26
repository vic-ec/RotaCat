import { Link } from 'react-router-dom'
import { Calendar, NotebookTabs } from 'lucide-react'
import Tag from './Tag'
import LeaveCodeBox from './myYear/LeaveCodeBox'
import { LEAVE_TYPE_LABELS } from '../lib/leaveRequests'
import { reviewStatusLabel } from '../lib/statusLabels'

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' }

// One leave request as a two-line row (My year → Leave, My leave →
// Upcoming): type and status, then dates, days and anything after (`detail`,
// e.g. the cover); the links as icons at the right — calendar: the roster
// on its first day; notebook: the planner or the request itself (see
// leaveDestination) — with an empty slot keeping the icons lined up.
// `dates`: the period as words; `days`: a count; `focused` tints the row.
export default function LeaveRequestRow({ request, dates, days, detail = '', rosterTo = null, open = null, focused = false }) {
  return (
    <li
      data-request-id={request.id}
      className={`flex items-center gap-2 py-2 pl-4 pr-2 ${focused ? 'bg-accent-tint' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <LeaveCodeBox leaveType={request.leave_type} />
          <span className="truncate">{LEAVE_TYPE_LABELS[request.leave_type] || request.leave_type}</span>
          <Tag variant="status" tone={STATUS_TONE[request.status] || 'neutral'}>{reviewStatusLabel(request.status)}</Tag>
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{dates} · {days} day{days === 1 ? '' : 's'}{detail ? ` · ${detail}` : ''}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-0.5">
        {rosterTo
          ? <RowActionLink to={rosterTo} icon={<Calendar className="h-4 w-4" />} label="Roster" />
          : <span className="h-9 w-9" aria-hidden="true" />}
        {open
          ? <RowActionLink to={open.to} icon={<NotebookTabs className="h-4 w-4" />} label={open.label} />
          : <span className="h-9 w-9" aria-hidden="true" />}
      </div>
    </li>
  )
}

// RowActionIcon's look as a router link (an in-app page).
function RowActionLink({ to, icon, label }) {
  return (
    <Link
      to={to}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-canvas-sunken hover:text-ink active:bg-canvas-sunken active:text-ink"
    >
      {icon}
    </Link>
  )
}
