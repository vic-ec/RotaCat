import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SquareArrowOutUpRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { leaveTrackersForYear, upcomingRequests } from '../lib/leaveDashboard'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import LeaveRequestForm from './LeaveRequestForm'
import LeaveCard from './LeaveCard'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const LEAVE_TYPE_ORDER = LEAVE_TYPE_OPTIONS.map(o => o.value)

// The "Requests" tab of this same Leave page — a doctor's own submission
// history (MyRequestHistory), which is where a pending request's status
// lives. Same page, so this is a tab switch via the URL, not a navigation
// away (see LeavePlannerPage's ?tab= handling).
const REQUESTS_PATH = '/leave?tab=requests'

// "My leave" tab content — only ever rendered for a signed-in doctor
// (canSubmitLeave), gated by the caller. A personal leave tracker,
// upcoming own requests, and the submission form all in one place, rather
// than a separate "dashboard" tab plus a separate "submit" tab. Full
// request history (past + rejected, not just upcoming) lives on the
// "Requests" tab under Planners instead of being duplicated here.
//
// One tracker card per leave type actually used this year (see
// leaveTrackersForYear) rather than the old fixed Annual/Special/Sick
// grouping: a doctor who's taken study leave and paternity leave was
// previously shown one merged "Special leave" figure covering both.
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

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Leave tracker</h2>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : trackers.length === 0 ? (
          <p className="rounded-lg border border-slate-line bg-canvas-raised px-4 py-3 text-sm text-ink-muted">
            No leave taken or requested this year.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {trackers.map(t => <TrackerCard key={t.leaveType} tracker={t} />)}
            </div>
            <p className="mt-3 text-xs text-ink-muted">Resets to zero on 1 January each year.</p>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Upcoming</h2>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : myUpcoming.length === 0 ? (
          <p className="rounded-lg border border-slate-line bg-canvas-raised px-4 py-3 text-sm text-ink-muted">
            Nothing upcoming.
          </p>
        ) : (
          <div className="space-y-3">
            {myUpcoming.map(lr => <LeaveCard key={lr.id} request={lr} />)}
          </div>
        )}
      </section>

      {showForm ? (
        <div>
          <p className="label-text">Request leave</p>
          <div className="mt-1">
            <LeaveRequestForm onSubmitted={load} />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
          Request leave
        </button>
      )}
    </div>
  )
}

// Annual leave is the only type with a real deducted-days figure
// (annual_leave_days); every other type reports approved *requests*,
// because no equivalent column or balance exists for them yet — a
// calendar-day span shown under a "days approved" heading would read as a
// balance that nothing actually tracks.
function TrackerCard({ tracker }) {
  const { leaveType, approvedDays, approvedRequests, pendingRequests } = tracker
  const showsDays = approvedDays != null
  const count = showsDays ? approvedDays : approvedRequests
  const unit = showsDays
    ? `day${approvedDays === 1 ? '' : 's'} approved`
    : `request${approvedRequests === 1 ? '' : 's'} approved`

  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ink-muted">{LEAVE_TYPE_LABELS[leaveType] || leaveType}</p>
      <p className="mt-1">
        <span className="font-display text-3xl font-bold text-ink">{count}</span>
        <span className="ml-1.5 text-sm text-ink-muted">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        {pendingRequests} request{pendingRequests === 1 ? '' : 's'} pending
      </p>
      {/* A pending count is the one number on this card the doctor can act
          on — it links straight to their own submission history on the
          Requests tab, where that request's status actually lives. */}
      {pendingRequests > 0 && (
        <Link
          to={REQUESTS_PATH}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-dark"
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          View request{pendingRequests === 1 ? '' : 's'}
        </Link>
      )}
    </div>
  )
}
