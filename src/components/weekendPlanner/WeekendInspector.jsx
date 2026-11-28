import { Link } from 'react-router-dom'
import { Pencil, Users, CircleCheck, CircleAlert, Copy, ClipboardPaste, Trash2 } from 'lucide-react'
import { weekendCoverageSummary, formatWeekendRange } from '../../lib/weekendPlanner'
import { weekendBadge, myRequestLine } from './viewHelpers'
import WeekendRequestsList from './WeekendRequestsList'

// The desktop split view's right-hand panel: the actions for whichever
// weekend is selected in the table (edit assignments, requests, copy,
// paste, clear) under its status — not a second copy of the row's names,
// which are read off the table itself. The per-category rows appear only
// while editing. Editing state is local and resets
// whenever the selected weekend changes, so switching weekends never leaves
// a stale picker open.
export default function WeekendInspector({
  saturday, weekendIndex, bySaturday, displayNames, doctorById, isAdmin, myRequest, myRequestName, canViewRequests,
  exceptions = [], editing = false, onToggleEditing, onClearWeekend, onCopyWeekend, onPasteWeekend, hasWeekendClipboard,
}) {

  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <div data-testid="weekend-inspector">
      <div>
        <p className="whitespace-nowrap text-base font-semibold text-ink">{formatWeekendRange(saturday)}</p>
        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-line pt-3">
        <span className="text-sm text-ink-muted">Overall status</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
        }`}>
          {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
          {needsPlanning
            ? `${coverage.openGroups.length} role${coverage.openGroups.length === 1 ? '' : 's'} open`
            : `${coverage.filledGroups} of ${coverage.totalGroups} groups planned`}
        </span>
      </div>

      {myRequest && (
        <p className="mt-2 text-xs font-semibold text-ink-light">
          {myRequestLine(myRequest.status, myRequestName)}
        </p>
      )}

      <WeekendRequestsList exceptions={exceptions} displayNames={displayNames} doctorById={doctorById} />

      {/* No assignments list here: the names are read off — and, while
          editing, changed on — the weekend's own row in the table beside
          this card. The card is for acting on the selected weekend: its
          status, then the actions. */}
          <div className="mt-4 space-y-2">
            {isAdmin && (
              <button
                type="button"
                onClick={onToggleEditing}
                className="btn-primary flex w-full items-center justify-center gap-1.5 text-sm"
              >
                {editing ? <><CircleCheck className="h-3.5 w-3.5" /> Done editing</> : <><Pencil className="h-3.5 w-3.5" /> Edit assignments</>}
              </button>
            )}
            {canViewRequests && (
              <Link to="/leave?tab=requests&from=weekends" className="btn-secondary flex w-full items-center justify-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5" /> View requests
              </Link>
            )}
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onCopyWeekend(saturday)}
                  disabled={coverage.filledGroups === 0}
                  className="btn-secondary flex flex-1 items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy weekend
                </button>
                {hasWeekendClipboard && (
                  <button
                    type="button"
                    onClick={() => onPasteWeekend(saturday)}
                    className="btn-secondary flex flex-1 items-center justify-center gap-1.5"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" /> Paste weekend
                  </button>
                )}
              </div>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => onClearWeekend(saturday)}
                disabled={coverage.filledGroups === 0}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-flagRed px-3 py-1.5 text-xs font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear weekend
              </button>
            )}
          </div>
    </div>
  )
}
