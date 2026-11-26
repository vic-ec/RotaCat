import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { leaveTrackersForYear, upcomingRequests } from '../lib/leaveDashboard'
import { LEAVE_TYPE_OPTIONS, ANNUAL_LEAVE_ALLOWANCE } from '../lib/leaveRequests'
import LeaveRequestForm from './LeaveRequestForm'
import LeaveRequestRow from './LeaveRequestRow'
import { formatShortDateRange } from '../lib/dateRange'
import { totalLeaveDays } from '../lib/leaveMatrix'
import { rosterLinkForDate } from '../lib/myYearData'
import { leaveDestination } from '../lib/myYearLinks'
import { useIsDesktop } from '../lib/useIsDesktop'
import Modal from './Modal'

const LEAVE_TYPE_ORDER = LEAVE_TYPE_OPTIONS.map(o => o.value)

// The "Requests" tab of this same Leave page — a doctor's own submission
// history (MyRequestHistory), which is where a pending request's status
// lives. Same page, so this is a tab switch via the URL, not a navigation
// away (see LeavePlannerPage's ?tab= handling).
const REQUESTS_PATH = '/leave?tab=requests'

// "My leave" tab content — only ever rendered for a signed-in doctor
// (canSubmitLeave), gated by the caller. Four things only: the annual
// balance, Request leave, upcoming own requests, and a link into My year,
// which holds everything else (other leave types, the full leave record,
// shifts, public holidays, attendance).
export default function LeaveDashboard() {
  const { profile, isAdmin } = useAuth()
  const wide = useIsDesktop(1024)
  const [trackers, setTrackers] = useState([])
  // Roster ids by "YYYY-MM", for each upcoming row's roster link.
  const [monthIds, setMonthIds] = useState({})
  const [myUpcoming, setMyUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over changes within a session

  async function load() {
    setLoading(true)
    const today = todayStr()
    const year = new Date().getFullYear()

    const [{ data }, monthsRes] = await Promise.all([
      supabase.from('leave_requests').select('*').eq('profile_id', profile.id).order('date_from', { ascending: true }),
      // Best effort: without it the rows just have no roster link.
      (async () => { try { return await supabase.from('roster_months').select('id, year, month').is('deleted_at', null) } catch { return { data: [] } } })(),
    ])
    const rows = data || []
    setMonthIds(Object.fromEntries((monthsRes?.data || []).map(m => [`${m.year}-${String(m.month).padStart(2, '0')}`, m.id])))

    setTrackers(leaveTrackersForYear(rows, year, LEAVE_TYPE_ORDER))
    setMyUpcoming(upcomingRequests(rows, today))
    setLoading(false)
  }

  const year = new Date().getFullYear()
  // Annual is the balance everyone has, so its card always shows — with no
  // annual history yet it reads 22 left, 0 booked, 0 pending.
  const annual = trackers.find(t => t.leaveType === 'annual')
    ?? { leaveType: 'annual', approvedDays: 0, approvedRequests: 0, pendingRequests: 0 }

  return (
    <div className="space-y-6">
      {/* One full-width column: balance card, upcoming, the My year link.
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

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Upcoming</h2>
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : myUpcoming.length === 0 ? (
          <p className="card px-4 py-3 text-sm text-ink-muted">Nothing upcoming.</p>
        ) : (
          // My year → Leave's rows: two lines, the roster and the planner
          // (or request) as icons.
          <ul className="card divide-y divide-slate-line overflow-hidden">
            {myUpcoming.map(lr => (
              <LeaveRequestRow
                key={lr.id}
                request={lr}
                dates={`${formatShortDateRange(lr.date_from, lr.date_to)} ${lr.date_to.slice(0, 4)}`}
                days={Number(totalLeaveDays(lr))}
                rosterTo={rosterLinkForDate(monthIds, lr.date_from, { doctor: profile.id, mark: true })}
                open={leaveDestination(lr, { isAdmin, own: true, wide, profileId: profile.id })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* The rest of the record — other leave types, past leave, shifts,
          public holidays, attendance — lives on My year. */}
      <Link
        to="/my-year"
        className="card flex min-h-[44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas-sunken active:bg-canvas-sunken"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">My year</span>
          <span className="mt-0.5 block text-xs text-ink-muted">Full leave record, shifts, public holidays and attendance</span>
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>

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
          // Shared rows (subgrid): a wrapped label never moves its number.
          <div key={stat.label} className="row-span-3 grid min-w-0 grid-rows-subgrid gap-0 p-3 sm:p-4">
            <dt className="text-xs font-medium text-ink-muted">{stat.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{stat.value}</dd>
            <dd className="mt-1 text-xs">{stat.extra || ''}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-slate-line px-3 py-2 text-xs text-ink-muted sm:px-4">
        {ANNUAL_LEAVE_ALLOWANCE} days a year · resets on 1 January
      </p>
    </div>
  )
}
