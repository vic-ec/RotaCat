import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { formatWeekdayDate, formatShortDateRange } from '../../lib/dateRange'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN, LEAVE_FULL_TIME_GROUP_KEYS, LEAVE_FULL_TIME_POOL_LABEL, COLUMN_BADGE_LABEL,
  capacityStateForCount, totalLeaveCeiling,
} from '../../lib/leaveYearGrid'
import { myCategoryDaySlots } from '../../lib/monthWorkspace'
import { resolveLeaveCapacityColumn } from '../../lib/internRotations'
import { getApprovalWarnings, approveLeaveRequest, rejectLeaveRequest } from '../../lib/leaveApprovals'
import { annualDaysSummary } from '../../lib/leaveRequests'
import CategoryBadge from '../CategoryBadge'
import { DayStepper } from '../DateStepper'
import DaySheet, { DayCount, DayStatus } from '../DaySheet'
import { REVIEW_STATUS_LABELS } from '../../lib/statusLabels'

const GRID_COLUMNS = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN]

function hasWarnings(w) {
  return Boolean(w) && (w.supervisionBreaches.length > 0 || w.balanceWarnings.length > 0 || Boolean(w.hourCeilingWarning) || Boolean(w.capacityWarning))
}

// The Annual month view's SELECTED DAY content — the one place a day is
// read: how full it is, whether there is room for the viewer's own
// category, the two pools, who is on leave, the admin's pending-request
// review, and the way to ask for the day. It replaced the centred
// DayReviewModal.
//
//   variant  'card': the desktop rail (mounted by PlannerDetailsCard), with
//            the full wording. 'sheet': a phone's DaySheet — the same
//            reading condensed to one status line, the explanations behind
//            an (i), and the request action pinned at the bottom.
//   entriesByColumn  dayEntriesByColumn's Map for the date
//   capacity         dayCapacitySummary's per-column { key, label, count, max }
//   pendingRows      raw leave_requests rows (with the profiles join) — the
//                    admin's review list is filtered to this date here
// Visibility follows the rows the caller could already read (RLS); the
// Consultant column is additionally hidden from a non-admin, as everywhere.
export default function DayDetails({
  date, entriesByColumn, capacity, phName, displayNames = new Map(), pendingRows = [], maxByColumnKey, maxFullTime, rotationsByDoctorId = new Map(),
  onDataChanged, onRequestLeave, onStepDay, variant = 'card', onClose,
}) {
  const { profile, isAdmin, canSubmitLeave } = useAuth()
  const visibleColumns = isAdmin ? GRID_COLUMNS : GRID_COLUMNS.filter(col => col.key !== 'Other')
  const pendingRequestsThisDate = pendingRows.filter(r => r.date_from <= date && r.date_to >= date)

  // ── The day's reading ──
  const totalSlots = capacity.reduce((sum, col) => sum + col.count, 0)
  const ceiling = totalLeaveCeiling(maxFullTime, maxByColumnKey)
  const dayState = capacityStateForCount(totalSlots)
  const statusLine = totalSlots === 0 ? `Free · 0 of ${ceiling} slots used`
    : totalSlots < ceiling ? `${totalSlots} of ${ceiling} slots used`
    : totalSlots === ceiling ? `Full · ${ceiling} of ${ceiling} slots used`
    : `Over capacity · ${totalSlots} on leave, ${ceiling} slots`

  const myColumnKey = resolveLeaveCapacityColumn({ category: profile?.category, contractType: profile?.contract_type, profileId: profile?.id, date, rotationsByDoctorId })
  const myColumnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === myColumnKey)
  const mySlots = myColumnDef ? myCategoryDaySlots(myColumnKey, capacity, maxFullTime) : null
  const hasRoomForMe = mySlots ? mySlots.taken < mySlots.max : totalSlots < ceiling

  const poolTaken = capacity.filter(c => LEAVE_FULL_TIME_GROUP_KEYS.includes(c.key)).reduce((sum, c) => sum + c.count, 0)
  const separatePools = capacity.filter(c => !LEAVE_FULL_TIME_GROUP_KEYS.includes(c.key) && c.max != null)

  const allEntries = visibleColumns.flatMap(col =>
    (entriesByColumn.get(col.key) || []).map(e => ({ ...e, columnKey: col.key, columnLabel: col.label }))
  )

  const allPeople = allEntries.length === 0 ? (
    <p className="mt-3 text-sm text-ink-muted">No one is on annual leave this day.</p>
  ) : (
    <ul className="mt-3 divide-y divide-slate-line border-t border-slate-line">
      {allEntries.map(e => (
        <li key={`${e.profileId}-${e.status}`} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={18} />
            <span className="flex-shrink-0 text-sm font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
            <span className="truncate text-xs text-ink-muted">{e.columnLabel} · {formatShortDateRange(e.dateFrom, e.dateTo)}</span>
          </span>
          <span className={`flex-shrink-0 text-xs font-medium ${e.status === 'pending' ? 'text-flagAmber' : 'text-success'}`}>
            {e.status === 'pending' ? REVIEW_STATUS_LABELS.pending : 'Approved'}
          </span>
        </li>
      ))}
    </ul>
  )

  // Keyed by date so a half-typed rejection never carries over to the next
  // day stepped to.
  const reviews = isAdmin && pendingRequestsThisDate.length > 0 && (
    <PendingReviews key={date} requests={pendingRequestsThisDate} onDataChanged={onDataChanged} />
  )

  const actionButton = canSubmitLeave && (
    <button type="button" onClick={() => onRequestLeave(date)} className="btn-secondary w-full text-sm">
      {hasRoomForMe ? 'Request leave from this day' : 'Submit for admin approval'}
    </button>
  )
  const overbookedNote = 'No slot is free for your category. You can still submit for an emergency; an admin must approve it as overbooked leave.'
  const phPill = phName && <p className="mt-1 inline-block rounded bg-ink/5 px-2 py-0.5 text-sm font-medium text-ink-light">{phName}</p>

  if (variant === 'sheet') {
    const word = totalSlots === 0 ? 'Free'
      : totalSlots < ceiling ? `${totalSlots} of ${ceiling} slots used`
      : totalSlots === ceiling ? 'Full'
      : 'Over capacity'
    const sharedLabel = LEAVE_FULL_TIME_POOL_LABEL.replace(/, ([^,]*)$/, ' and $1')
    return (
      <DaySheet
        date={date}
        onStep={onStepDay}
        onClose={onClose}
        count={(
          <DayCount
            value={`${totalSlots}/${ceiling}`}
            label="slots"
            title={`${totalSlots} of ${ceiling} slots used`}
            toneClassName={`ring-1 ring-inset ${dayState.tint} ${dayState.ringDark}`}
            valueClassName={dayState.text}
          />
        )}
        footer={actionButton || undefined}
      >
        <div data-testid="day-details">
          {phPill && <div className="-mt-1 mb-2">{phPill}</div>}
          <DayStatus
            toneClassName={`${dayState.tint} ${dayState.ringDark}`}
            textClassName={dayState.text}
            line={myColumnDef ? `${word} · ${hasRoomForMe ? 'room' : 'no room'} for ${myColumnDef.label}` : statusLine}
            subline={[`Main pool ${poolTaken}/${maxFullTime}`, ...separatePools.map(c => `${c.label} ${c.count}/${c.max}`)].join(' · ')}
            infoLabel="About these numbers"
            info={(
              <>
                <p>
                  {sharedLabel} share the main pool of {maxFullTime} {maxFullTime === 1 ? 'slot' : 'slots'}.
                  {separatePools.map(c => ` The ${c.label} pool has ${c.max} ${c.max === 1 ? 'slot' : 'slots'} of its own, which no other category can use.`)}
                  {' '}{ceiling} slots in total.
                </p>
                {canSubmitLeave && !hasRoomForMe && <p>{overbookedNote}</p>}
              </>
            )}
          />
          {allPeople}
          {reviews}
        </div>
      </DaySheet>
    )
  }

  return (
    <div data-testid="day-details">
      {onStepDay ? (
        <>
          <h3 className="sr-only">{formatWeekdayDate(date)}</h3>
          <div className="mt-1"><DayStepper date={date} onStep={onStepDay} /></div>
        </>
      ) : (
        <h3 className="font-display text-base font-semibold text-ink">{formatWeekdayDate(date)}</h3>
      )}
      {phPill}

      {/* Status in the day's own capacity colour, with the count in words
          (never colour alone), the viewer's own room on the second line,
          then each pool on its own — read from the live limits, never
          hard-coded. */}
      <div className={`mt-3 rounded-lg p-3 ring-1 ring-inset ${dayState.tint} ${dayState.ringDark}`}>
        <p className={`text-sm font-bold ${dayState.text}`}>{statusLine}</p>
        {myColumnDef && (
          <p className="mt-0.5 text-xs font-medium text-ink">
            {hasRoomForMe ? 'Room' : 'No room'} for your category ({myColumnDef.label})
          </p>
        )}
        <p className="mt-1.5 text-xs text-ink-light">
          {LEAVE_FULL_TIME_POOL_LABEL.replace(/, /g, ' · ')}: {poolTaken} of {maxFullTime} {maxFullTime === 1 ? 'slot' : 'slots'} used
        </p>
        {separatePools.map(c => (
          <p key={c.key} className="text-xs text-ink-light">
            {c.label}: {c.count} of {c.max} {c.max === 1 ? 'slot' : 'slots'} used
          </p>
        ))}
        <p className="mt-1.5 text-[11px] text-ink-muted">The two pools are separate: the OT Intern slot cannot be used by other categories.</p>
      </div>

      {allPeople}
      {reviews}

      {/* Always a way to ask. A full day is not a dead end: the request
          goes in as an emergency for the admin to approve as overbooked
          (the form itself says so again and asks for a motivation). Both
          buttons are outlined — the panel's primary is the page's only
          filled one. */}
      {actionButton && (
        <div className="mt-4 border-t border-slate-line pt-3">
          {!hasRoomForMe && <p className="mb-2 text-xs text-ink-muted">{overbookedNote}</p>}
          {actionButton}
        </div>
      )}
    </div>
  )
}

// An admin's review of the requests still pending on the day: each with its
// warnings (supervision, balance, hours, and the live capacity re-check)
// and Approve / Reject.
function PendingReviews({ requests, onDataChanged }) {
  const { user } = useAuth()
  const [warningsById, setWarningsById] = useState({})
  const [actioningId, setActioningId] = useState(null)
  const [confirmingApproveId, setConfirmingApproveId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadWarnings() {
      const entries = await Promise.all(requests.map(async r => [r.id, await getApprovalWarnings(r)]))
      if (!cancelled) setWarningsById(Object.fromEntries(entries))
    }
    loadWarnings()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per day; the parent keys this component by date
  }, [])

  async function handleApprove(request) {
    setActioningId(request.id)
    try {
      await approveLeaveRequest(request, user.id)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setConfirmingApproveId(null)
    setActioningId(null)
    onDataChanged()
  }

  async function handleReject(request) {
    setActioningId(request.id)
    try {
      await rejectLeaveRequest(request, user.id, rejectNotes)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setRejectingId(null)
    setRejectNotes('')
    setActioningId(null)
    onDataChanged()
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-line pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pending requests</p>
      {error && <p className="text-sm text-flagRed">{error}</p>}
      {requests.map(request => {
        // Every warning, capacity included, comes from
        // getApprovalWarnings — the capacity one is the
        // annual_leave_capacity RPC's live re-check of this request
        // against everyone else's leave, the same check the Requests
        // queue runs, so the two screens can never disagree.
        const w = warningsById[request.id]
        const warned = hasWarnings(w)
        const capacityWarned = Boolean(w?.capacityWarning)
        const confirming = confirmingApproveId === request.id
        const isActioning = actioningId === request.id
        const approveLabel = isActioning ? 'Approving…'
          : capacityWarned ? (confirming ? 'Confirm overbooked approval' : 'Approve as overbooked')
          : warned ? (confirming ? 'Confirm approval' : 'Approve anyway')
          : 'Approve'

        return (
          <div key={request.id} className="rounded-lg border border-slate-line p-3">
            <p className="text-sm font-medium text-ink">
              {request.profiles?.name} {request.profiles?.surname}
            </p>
            <p className="text-xs text-ink-muted">
              {request.date_from === request.date_to
                ? formatWeekdayDate(request.date_from)
                : `${formatWeekdayDate(request.date_from)} → ${formatWeekdayDate(request.date_to)}`}
            </p>
            {annualDaysSummary(request) && <p className="text-xs text-ink-muted">{annualDaysSummary(request)}</p>}
            {request.notes && <p className="mt-1 text-xs italic text-ink-light">&quot;{request.notes}&quot;</p>}

            {capacityWarned && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-flagAmber bg-flagAmber-bg p-2 text-xs text-flagAmber">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Approving would breach the {w.capacityWarning.limitLabel} ({w.capacityWarning.limitMax}) on {w.capacityWarning.firstBreachDate}. Approve as overbooked to proceed.
                </span>
              </div>
            )}
            {request.over_capacity && !capacityWarned && (
              <p className="mt-2 text-xs text-ink-muted">Submitted as overbooked; capacity has since freed up.</p>
            )}
            {warned && (
              <div className="mt-2 space-y-1 rounded border border-flagAmber bg-flagAmber-bg p-2">
                {w.supervisionBreaches.length > 0 && (
                  <p className="text-xs text-flagAmber">
                    ⚠ Approving would drop supervision below the required minimum on {w.supervisionBreaches.length} shift{w.supervisionBreaches.length !== 1 ? 's' : ''}.
                  </p>
                )}
                {w.balanceWarnings.map(bw => (
                  <p key={bw.year} className="text-xs text-flagAmber">
                    ⚠ {bw.year} annual leave balance would go negative ({bw.remainingAfter} of {bw.daysAllotted} days remaining).
                  </p>
                ))}
                {w.hourCeilingWarning && (
                  <p className="text-xs text-flagAmber">
                    ⚠ Five-eighths doctor already has {w.hourCeilingWarning.alreadyRosteredHours}h rostered this month (ceiling: {w.hourCeilingWarning.maxHours}h).
                  </p>
                )}
              </div>
            )}

            {rejectingId === request.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Reason (optional, visible to the doctor)…"
                  rows={2}
                  className="input-field w-full"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReject(request)}
                    disabled={isActioning}
                    className="rounded border border-flagRed px-3 py-1 text-xs font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isActioning ? 'Rejecting…' : 'Confirm reject'}
                  </button>
                  <button onClick={() => { setRejectingId(null); setRejectNotes('') }} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => warned && !confirming ? setConfirmingApproveId(request.id) : handleApprove(request)}
                  disabled={isActioning || warningsById[request.id] === undefined}
                  className="btn-success"
                >
                  {approveLabel}
                </button>
                <button onClick={() => setRejectingId(request.id)} disabled={isActioning} className="btn-danger-outline">
                  Reject
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
