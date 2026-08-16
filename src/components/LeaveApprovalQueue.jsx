import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarArrowDown, CalendarArrowUp, CalendarSearch, ListFilter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar from './ProfileAvatar'
import Tag from './Tag'
import Toolbar from './Toolbar'
import RequestReviewDrawer from './RequestReviewDrawer'
import LeaveRequestSummary from './LeaveRequestSummary'
import CapacityAssessment from './CapacityAssessment'
import AffectedLeaveList from './AffectedLeaveList'
import LeaveRequestDecisionFooter from './LeaveRequestDecisionFooter'
import { SelectAllRow } from './ListRow'
import BulkActionBar from './BulkActionBar'
import FloatingActionMenu from './FloatingActionMenu'
import { getApprovalWarnings, approveLeaveRequest, rejectLeaveRequest } from '../lib/leaveApprovals'
import { LEAVE_TYPE_OPTIONS, fetchAnnualCapacityPreview, fetchAffectedLeaveForRequest } from '../lib/leaveRequests'
import { datesInRange } from '../lib/dateRange'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  COSMO:      'COSMO',
  COSMOPsych: 'COSMO (Psych)',
  Intern:     'Intern',
  Consultant: 'Consultant',
  Locum:      'Locum',
}

function hasWarnings(w) {
  return Boolean(w) && (w.supervisionBreaches.length > 0 || w.balanceWarnings.length > 0 || Boolean(w.hourCeilingWarning))
}

// One row of the pending-requests list — checkbox, avatar, name, category
// tag, and a one-line "{type} request, submitted {date}" summary.
// Approve/reject now live in the detail panel (LeaveRequestDetailPanel below) opened by tapping the
// row, so the row itself only keeps the always-visible View Calendar
// action — deliberately a plain button, not ListRow's RowActions, since
// RowActions collapses even a single action behind a kebab on mobile and
// this one wants to stay visible on every viewport.
function LeaveRequestRow({ request, categoryLabel, leaveTypeLabel, fullName, checked, onToggleCheck, onOpen, onViewCalendar }) {
  // Same "DD-MM-YYYY · HH:MM" template as the detail drawer's own
  // "Submitted X" meta line, so the row and the drawer never disagree.
  const submittedDate = request.created_at?.slice(0, 10).split('-').reverse().join('-')
  const submittedTime = request.created_at?.slice(11, 16)
  return (
    <div
      onClick={onOpen}
      className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleCheck}
        onClick={e => e.stopPropagation()}
        aria-label={`Select ${fullName}`}
        className="h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
        style={{ minWidth: 16 }}
      />
      <ProfileAvatar profile={{ id: request.profile_id, ...request.profiles }} size={32} className="flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{fullName}</p>
          {categoryLabel && <Tag variant="role">{categoryLabel}</Tag>}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{leaveTypeLabel} request, submitted {submittedDate} · {submittedTime}</p>
      </div>
      <button
        type="button"
        title="View Calendar"
        aria-label="View Calendar"
        onClick={e => { e.stopPropagation(); onViewCalendar() }}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-accent/40 text-accent transition-colors hover:border-accent hover:bg-accent-tint active:border-accent active:bg-accent active:text-white"
      >
        <CalendarSearch className="h-5 w-5" />
      </button>
    </div>
  )
}

// Rejecting here requires a reason — unlike the bulk-reject action above
// the list, which stays reason-optional.
//
// The tap-to-open detail drawer for one pending request — built on
// RequestReviewDrawer (persistent right-side panel, list stays visible
// beside it; see that component for why this replaced the old centered
// Modal). Content follows the redesign's decision-focused hierarchy: 1)
// identity/status (drawer header), 2) requested period
// (LeaveRequestSummary), 3) capacity assessment (CapacityAssessment), 4)
// who else is affected (AffectedLeaveList), 5) the approve/decline decision
// (LeaveRequestDecisionFooter, sticky).
function LeaveRequestDetailPanel({
  request, fullName, categoryLabel, leaveTypeLabel, submittedDate, submittedTime, publicHolidayFrom, publicHolidayTo, totalDays, annualLeaveDays,
  warnings, warned, warningsLoading, capacityPreview, capacityLoading, affectedEntries, affectedLoading,
  onClose, onOpenCalendar,
  rejecting, rejectNotes, onRejectNotesChange, onRejectStart, onRejectCancel, onRejectConfirm,
  approveLabel, onApprove, isActioning,
}) {
  const emptyAffectedMessage = request.leave_type === 'annual' && capacityPreview
    ? 'No overlapping leave in this pool.'
    : 'No overlapping leave in this period.'

  return (
    <RequestReviewDrawer
      title={`${leaveTypeLabel} request`}
      statusTag={<Tag variant="status" tone="warning">Pending</Tag>}
      meta={`Submitted ${submittedDate} · ${submittedTime}`}
      onClose={onClose}
      footer={
        <LeaveRequestDecisionFooter
          rejecting={rejecting}
          rejectNotes={rejectNotes}
          onRejectCancel={onRejectCancel}
          onRejectConfirm={onRejectConfirm}
          approveLabel={approveLabel}
          onApprove={onApprove}
          onDeclineStart={onRejectStart}
          isActioning={isActioning}
          approveDisabled={isActioning || warningsLoading}
        />
      }
    >
      <div className="space-y-5">
        <LeaveRequestSummary
          request={request}
          fullName={fullName}
          categoryLabel={categoryLabel}
          totalDays={totalDays}
          annualLeaveDays={annualLeaveDays}
          publicHolidayFrom={publicHolidayFrom}
          publicHolidayTo={publicHolidayTo}
        />

        <CapacityAssessment
          capacityPreview={capacityPreview}
          capacityLoading={capacityLoading}
          warnings={warnings}
          warned={warned}
          warningsLoading={warningsLoading}
          onViewCalendar={onOpenCalendar}
        />

        <AffectedLeaveList
          entries={affectedEntries || []}
          loading={affectedLoading}
          emptyMessage={emptyAffectedMessage}
        />

        {request.notes && (
          <div>
            <p className="label-text">Note from doctor</p>
            <p className="text-sm italic text-ink-light">&quot;{request.notes}&quot;</p>
          </div>
        )}

        {rejecting && (
          <div className="space-y-1.5">
            <label htmlFor="rejectNotes" className="label-text">Reason for declining</label>
            <textarea
              id="rejectNotes"
              value={rejectNotes}
              onChange={e => onRejectNotesChange(e.target.value)}
              placeholder="Required — visible to the doctor…"
              rows={3}
              className="input-field w-full"
            />
          </div>
        )}
      </div>
    </RequestReviewDrawer>
  )
}

// The admin approval inbox — every pending leave_requests row, of any leave
// type. onBack, when given, renders a small "return to where you opened
// this from" link above the queue (LeavePlannerPage.jsx wires this to the
// Annual planner's overview tab, since that's the only place this queue is
// currently linked from).
export default function LeaveApprovalQueue({ onBack }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [warningsById, setWarningsById] = useState({})
  const [publicHolidayDates, setPublicHolidayDates] = useState(new Set())
  const [confirmingApproveId, setConfirmingApproveId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [actioningId, setActioningId] = useState(null)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [sortDirection, setSortDirection] = useState('asc')
  const [bulkActioning, setBulkActioning] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all')
  // The request whose review drawer is currently open, if any.
  const [expandedId, setExpandedId] = useState(null)
  // Per-request annual-leave capacity preview, fetched lazily the first
  // time its drawer opens (undefined = not fetched yet, null = fetched but
  // no capacity column applies to this category/leave type).
  const [capacityByRequestId, setCapacityByRequestId] = useState({})
  // Per-request "who else is already away" list, fetched lazily alongside
  // the capacity preview (undefined = not fetched yet).
  const [affectedByRequestId, setAffectedByRequestId] = useState({})

  useEffect(() => { loadQueue() }, [])

  useEffect(() => {
    if (!expandedId) return
    const request = requests.find(r => r.id === expandedId)
    if (!request || request.leave_type !== 'annual' || capacityByRequestId[expandedId] !== undefined) return
    let cancelled = false
    fetchAnnualCapacityPreview({
      dateFrom: request.date_from,
      dateTo: request.date_to,
      category: request.profiles?.category,
      contractType: request.profiles?.contract_type,
      profileId: request.profile_id,
    }).then(preview => { if (!cancelled) setCapacityByRequestId(prev => ({ ...prev, [expandedId]: preview })) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requests/capacityByRequestId read via closure; re-running once they change would refetch in a loop
  }, [expandedId])

  useEffect(() => {
    if (!expandedId) return
    const request = requests.find(r => r.id === expandedId)
    if (!request || affectedByRequestId[expandedId] !== undefined) return
    let cancelled = false
    fetchAffectedLeaveForRequest({
      dateFrom: request.date_from,
      dateTo: request.date_to,
      leaveType: request.leave_type,
      category: request.profiles?.category,
      contractType: request.profiles?.contract_type,
      profileId: request.profile_id,
    }).then(entries => { if (!cancelled) setAffectedByRequestId(prev => ({ ...prev, [expandedId]: entries })) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requests/affectedByRequestId read via closure; re-running once they change would refetch in a loop
  }, [expandedId])

  async function loadQueue() {
    setLoading(true)
    setError('')
    const [queueRes, phRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type, avatar_url, color_code, pattern_type)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('public_holidays').select('date'),
    ])
    if (queueRes.error) { setError(queueRes.error.message); setLoading(false); return }
    const data = queueRes.data || []
    setRequests(data)
    setWarningsById({})
    setPublicHolidayDates(new Set((phRes.data || []).map(ph => ph.date)))
    setLoading(false)

    const warningEntries = await Promise.all(
      data.map(async r => [r.id, await getApprovalWarnings(r)])
    )
    setWarningsById(Object.fromEntries(warningEntries))
  }

  // "View Calendar" jumps to the Annual planner's month workspace for this
  // request's month, with that date's review modal pre-opened — only fully
  // meaningful for annual leave, since the Annual planner's data (and its
  // month workspace) is scoped to leave_type='annual'. For any other type,
  // land on the Special tab instead — it doesn't have a per-day modal yet
  // (see FUTURE_IDEAS.md), but it's still the right neighbourhood.
  function openInCalendar(request) {
    if (request.leave_type === 'annual') {
      const month = request.date_from.slice(0, 7)
      navigate(`/leave?tab=planners&sub=annual&month=${month}&highlight=${request.date_from}`)
    } else {
      navigate('/leave?tab=planners&sub=special')
    }
  }

  async function approve(request) {
    setActioningId(request.id)
    try {
      await approveLeaveRequest(request, user.id)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setConfirmingApproveId(null)
    setRequests(rs => rs.filter(r => r.id !== request.id))
    setActioningId(null)
  }

  async function reject(request) {
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
    setRequests(rs => rs.filter(r => r.id !== request.id))
    setActioningId(null)
  }

  function closePanel() {
    setExpandedId(null)
    setRejectingId(null)
    setRejectNotes('')
    setConfirmingApproveId(null)
  }

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(prev =>
      prev.size === displayedRequests.length ? new Set() : new Set(displayedRequests.map(r => r.id))
    )
  }

  async function bulkApprove() {
    const targets = requests.filter(r => selectedIds.has(r.id))
    setBulkActioning(true)
    setSelectedIds(new Set())
    await Promise.all(targets.map(r => approveLeaveRequest(r, user.id).catch(err => setError(err.message))))
    await loadQueue()
    setBulkActioning(false)
  }

  async function bulkReject() {
    const targets = requests.filter(r => selectedIds.has(r.id))
    setBulkActioning(true)
    setSelectedIds(new Set())
    await Promise.all(targets.map(r => rejectLeaveRequest(r, user.id, '').catch(err => setError(err.message))))
    await loadQueue()
    setBulkActioning(false)
  }

  const filteredRequests = requests.filter(r => {
    if (leaveTypeFilter !== 'all' && r.leave_type !== leaveTypeFilter) return false
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase()
      const fullName = `${r.profiles?.surname || ''} ${r.profiles?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    return true
  })
  const displayedRequests = sortDirection === 'asc' ? filteredRequests : [...filteredRequests].reverse()
  const filtersActive = Boolean(searchQuery) || leaveTypeFilter !== 'all'

  const backLink = onBack && (
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Back to Annual planner
    </button>
  )

  if (loading) return <>{backLink}<p className="text-sm text-ink-muted">Loading pending requests…</p></>
  if (error) return <>{backLink}<p className="text-sm text-flagRed">{error}</p></>
  if (requests.length === 0) return <>{backLink}<p className="text-sm text-ink-muted">No pending leave requests.</p></>

  const expandedRequest = requests.find(r => r.id === expandedId) || null
  const expandedWarnings = expandedRequest ? warningsById[expandedRequest.id] : undefined
  const expandedWarningsLoading = Boolean(expandedRequest) && expandedWarnings === undefined
  const expandedWarned = hasWarnings(expandedWarnings)
  const expandedCapacityPreview = expandedRequest ? capacityByRequestId[expandedRequest.id] : undefined
  const expandedCapacityLoading = Boolean(expandedRequest) && expandedRequest.leave_type === 'annual' && expandedCapacityPreview === undefined
  const expandedAffectedEntries = expandedRequest ? affectedByRequestId[expandedRequest.id] : undefined
  const expandedAffectedLoading = Boolean(expandedRequest) && expandedAffectedEntries === undefined
  // A full capacity gauge is as much a reason to pause as a Tier-2 warning
  // — folded into the same "needs a second click" gate so approving into
  // an at-capacity pool isn't a single accidental tap, even though the
  // preview itself stays purely advisory (never blocks the mutation).
  const expandedNeedsConfirm = expandedWarned || Boolean(expandedCapacityPreview?.atCapacity)
  const expandedConfirming = Boolean(expandedRequest) && confirmingApproveId === expandedRequest.id
  const expandedApproveLabel = expandedNeedsConfirm ? (expandedConfirming ? 'Confirm approval' : 'Approve anyway') : 'Approve request'
  const expandedIsActioning = Boolean(expandedRequest) && actioningId === expandedRequest.id
  const expandedRejecting = Boolean(expandedRequest) && rejectingId === expandedRequest.id

  return (
    <div>
      {backLink}

      {(() => {
        const sortFacets = [{
          key: 'sort',
          icon: sortDirection === 'desc' ? <CalendarArrowUp className="h-4 w-4" /> : <CalendarArrowDown className="h-4 w-4" />,
          label: 'Sort',
          value: sortDirection, onChange: setSortDirection,
          options: [{ value: 'asc', label: 'Oldest first' }, { value: 'desc', label: 'Newest first' }],
          isActive: sortDirection !== 'asc',
        }]
        const filterFacets = [{
          key: 'filter', icon: <ListFilter className="h-4 w-4" />, label: 'Filter',
          value: leaveTypeFilter, onChange: setLeaveTypeFilter,
          options: [{ value: 'all', label: 'All leave types' }, ...LEAVE_TYPE_OPTIONS],
          isActive: leaveTypeFilter !== 'all',
        }]
        const onClearAll = () => { setSearchQuery(''); setLeaveTypeFilter('all') }
        return (
          <>
            {/* Below `md` this row is replaced by the Toolbar FAB (§15);
                `md:` and up keeps the existing inline row untouched. */}
            <div className="hidden md:block">
              <Toolbar
                className="mb-4"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search by surname or first name…"
                sortFacets={sortFacets}
                filterFacets={filterFacets}
                mobileMode="inline"
                active={filtersActive}
                onClearAll={onClearAll}
              />
            </div>
            {/* BulkActionBar owns the bottom edge the moment a request is
                checked — the two must never be on screen together. */}
            <FloatingActionMenu
              hidden={selectedIds.size > 0}
              search={{ value: searchQuery, onChange: setSearchQuery, placeholder: 'Search by surname or first name…' }}
              sort={{ facets: sortFacets, active: sortDirection !== 'asc' }}
              filter={{
                facets: filterFacets,
                active: filtersActive,
                onClearAll,
                sheetTitle: 'Filters',
              }}
            />
          </>
        )
      })()}

      {displayedRequests.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mb-3 text-sm text-ink-muted">No pending requests match these filters.</p>
          {filtersActive && (
            <button onClick={() => { setSearchQuery(''); setLeaveTypeFilter('all') }} className="btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      ) : (
      <>
      <BulkActionBar
        count={selectedIds.size}
        disabled={bulkActioning}
        actions={[
          { label: 'Approve selected', onClick: bulkApprove },
          { label: 'Reject selected', onClick: bulkReject, tone: 'danger' },
        ]}
        onCancel={() => setSelectedIds(new Set())}
      />

      <div className="card overflow-hidden">
        <SelectAllRow
          checked={selectedIds.size === displayedRequests.length}
          onToggleCheck={toggleSelectAll}
          selectLabel="Select all pending leave requests"
          active={selectedIds.size > 0}
        />
        <div className="divide-y divide-slate-line">
          {displayedRequests.map(request => {
            const fullName = `${request.profiles?.name || ''} ${request.profiles?.surname || ''}`.trim()
            const categoryLabel = request.profiles?.category ? (CATEGORY_LABELS[request.profiles.category] || request.profiles.category) : null
            return (
              <LeaveRequestRow
                key={request.id}
                request={request}
                fullName={fullName}
                categoryLabel={categoryLabel}
                leaveTypeLabel={LEAVE_TYPE_LABELS[request.leave_type]}
                checked={selectedIds.has(request.id)}
                onToggleCheck={() => toggleSelected(request.id)}
                onOpen={() => setExpandedId(request.id)}
                onViewCalendar={() => openInCalendar(request)}
              />
            )
          })}
        </div>
      </div>
      </>
      )}

      {expandedRequest && (() => {
        const fullName = `${expandedRequest.profiles?.name || ''} ${expandedRequest.profiles?.surname || ''}`.trim()
        const categoryLabel = expandedRequest.profiles?.category ? (CATEGORY_LABELS[expandedRequest.profiles.category] || expandedRequest.profiles.category) : null
        const publicHolidayFrom = publicHolidayDates.has(expandedRequest.date_from)
        const publicHolidayTo = publicHolidayDates.has(expandedRequest.date_to)
        const totalDays = datesInRange(expandedRequest.date_from, expandedRequest.date_to).length
        const annualLeaveDays = expandedRequest.leave_type === 'annual' ? expandedRequest.annual_leave_days : null
        // Same "DD-MM-YYYY at HH:MM" template as the pending-registration
        // review page's own "Registered X at Y" line.
        const submittedDate = expandedRequest.created_at?.slice(0, 10).split('-').reverse().join('-')
        const submittedTime = expandedRequest.created_at?.slice(11, 16)

        return (
          <LeaveRequestDetailPanel
            request={expandedRequest}
            fullName={fullName}
            categoryLabel={categoryLabel}
            leaveTypeLabel={LEAVE_TYPE_LABELS[expandedRequest.leave_type]}
            submittedDate={submittedDate}
            submittedTime={submittedTime}
            publicHolidayFrom={publicHolidayFrom}
            publicHolidayTo={publicHolidayTo}
            totalDays={totalDays}
            annualLeaveDays={annualLeaveDays}
            warnings={expandedWarnings}
            warned={expandedWarned}
            warningsLoading={expandedWarningsLoading}
            capacityPreview={expandedCapacityPreview}
            capacityLoading={expandedCapacityLoading}
            affectedEntries={expandedAffectedEntries}
            affectedLoading={expandedAffectedLoading}
            onClose={closePanel}
            onOpenCalendar={() => openInCalendar(expandedRequest)}
            rejecting={expandedRejecting}
            rejectNotes={rejectNotes}
            onRejectNotesChange={setRejectNotes}
            onRejectStart={() => setRejectingId(expandedRequest.id)}
            onRejectCancel={() => { setRejectingId(null); setRejectNotes('') }}
            onRejectConfirm={() => reject(expandedRequest)}
            approveLabel={expandedApproveLabel}
            onApprove={() => (expandedNeedsConfirm && !expandedConfirming) ? setConfirmingApproveId(expandedRequest.id) : approve(expandedRequest)}
            isActioning={expandedIsActioning}
          />
        )
      })()}
    </div>
  )
}
