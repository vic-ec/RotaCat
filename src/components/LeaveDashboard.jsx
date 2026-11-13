import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { leaveTrackersForYear, upcomingRequests } from '../lib/leaveDashboard'
import { LEAVE_TYPE_OPTIONS, ANNUAL_LEAVE_ALLOWANCE } from '../lib/leaveRequests'
import LeaveRequestForm from './LeaveRequestForm'
import LeaveCard from './LeaveCard'
import Modal from './Modal'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const LEAVE_TYPE_ORDER = LEAVE_TYPE_OPTIONS.map(o => o.value)

// The "Requests" tab of this same Leave page — a doctor's own submission
// history (MyRequestHistory), which is where a pending request's status
// lives. Same page, so this is a tab switch via the URL, not a navigation
// away (see LeavePlannerPage's ?tab= handling).
const REQUESTS_PATH = '/leave?tab=requests'

// "My leave" tab content — only ever rendered for a signed-in doctor
// (canSubmitLeave), gated by the caller. The annual balance, any other
// leave types used this year, upcoming own requests, and the submission
// form all in one place, rather than a separate "dashboard" tab plus a
// separate "submit" tab. Full
// request history (past + rejected, not just upcoming) lives on the
// "Requests" tab under Planners instead of being duplicated here.
//
// One row per non-annual leave type actually used this year (see
// leaveTrackersForYear) rather than a fixed Annual/Special/Sick grouping:
// a doctor who's taken study leave and paternity leave sees each.
export default function LeaveDashboard() {
  const { profile } = useAuth()
  const [trackers, setTrackers] = useState([])
  const [myUpcoming, setMyUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over changes within a session

  async function load() {
    setLoading(true)
    const today = todayStr()
    const year = new Date().getFullYear()

    const { data } = await supabase.from('leave_requests').select('*').eq('profile_id', profile.id).order('date_from', { ascending: true })
    const rows = data || []

    setTrackers(leaveTrackersForYear(rows, year, LEAVE_TYPE_ORDER))
    setMyUpcoming(upcomingRequests(rows, today))
    setLoading(false)
  }

  const year = new Date().getFullYear()
  // Annual is the balance everyone has, so its card always shows — with no
  // annual history yet it reads 22 left, 0 booked, 0 pending.
  const annual = trackers.find(t => t.leaveType === 'annual')
    ?? { leaveType: 'annual', approvedDays: 0, approvedRequests: 0, pendingRequests: 0 }
  const otherTrackers = trackers.filter(t => t.leaveType !== 'annual')

  return (
    <div className="space-y-6">
      {/* One full-width column: balance card, other leave types, upcoming.
          Request leave sits on the first heading so it stays put however
          long the Upcoming list grows. */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Annual leave · {year}</h2>
          <button type="button" onClick={() => setShowForm(true)} className="btn-primary text-sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Request leave
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          <AnnualBalanceCard tracker={annual} />
        )}
      </section>

      {!loading && otherTrackers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink">Other leave · {year}</h2>
          <ul className="card divide-y divide-slate-line overflow-hidden">
            {otherTrackers.map(t => <OtherLeaveRow key={t.leaveType} tracker={t} />)}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Upcoming</h2>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : myUpcoming.length === 0 ? (
          <p className="card px-4 py-3 text-sm text-ink-muted">Nothing upcoming.</p>
        ) : (
          <ul className="card divide-y divide-slate-line overflow-hidden">
            {myUpcoming.map(lr => (
              <li key={lr.id} className="p-4"><LeaveCard request={lr} bare /></li>
            ))}
          </ul>
        )}
      </section>

      {/* Centered on every viewport, not the usual bottom sheet — this one
          is opened deliberately from a button and then filled in, rather
          than drilling into something the viewer just tapped (a planner
          day), where rising from the bottom keeps that thing in view.
          Closes on submit, after `load` has refreshed the tracker and
          Upcoming list behind it, so the new request is already there. */}
      {showForm && (
        <Modal title="Request leave" onClose={() => setShowForm(false)} centered>
          <LeaveRequestForm onSubmitted={() => { load(); setShowForm(false) }} />
        </Modal>
      )}
    </div>
  )
}

function PendingLink({ count }) {
  if (count === 0) return null
  return (
    <Link to={REQUESTS_PATH} className="font-medium text-accent hover:text-accent-dark">
      View request{count === 1 ? '' : 's'} ›
    </Link>
  )
}

// Days left leads — it's the number people come for. "Booked" (not
// "used"): approved leave counts against the balance as soon as it's
// approved, whether or not the dates have passed yet. Pending is a count of
// requests, since a request has no settled day count until it's approved.
function AnnualBalanceCard({ tracker }) {
  const booked = tracker.approvedDays ?? 0
  const left = ANNUAL_LEAVE_ALLOWANCE - booked
  const pending = tracker.pendingRequests
  const stats = [
    { label: 'Days left', value: left },
    { label: 'Days booked', value: booked },
    { label: 'Pending requests', value: pending, extra: <PendingLink count={pending} /> },
  ]
  return (
    <div className="card overflow-hidden">
      <dl className="grid grid-cols-3 divide-x divide-slate-line">
        {stats.map(stat => (
          <div key={stat.label} className="min-w-0 p-3 sm:p-4">
            <dt className="text-xs font-medium text-ink-muted">{stat.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{stat.value}</dd>
            {stat.extra && <dd className="mt-1 text-xs">{stat.extra}</dd>}
          </div>
        ))}
      </dl>
      <p className="border-t border-slate-line px-3 py-2 text-xs text-ink-muted sm:px-4">
        {ANNUAL_LEAVE_ALLOWANCE} days a year · resets on 1 January
      </p>
    </div>
  )
}

// Every type except annual has no deducted-days column, so these report
// approved *requests*, not days — a calendar-day span under a "days" heading
// would read as a balance that nothing actually tracks.
function OtherLeaveRow({ tracker }) {
  const { leaveType, approvedRequests, pendingRequests } = tracker
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
      <span className="text-sm font-semibold text-ink">{LEAVE_TYPE_LABELS[leaveType] || leaveType}</span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
        <span>{approvedRequests} request{approvedRequests === 1 ? '' : 's'} booked</span>
        <span aria-hidden="true">·</span>
        <span>{pendingRequests} pending</span>
        {pendingRequests > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <PendingLink count={pendingRequests} />
          </>
        )}
      </span>
    </li>
  )
}
