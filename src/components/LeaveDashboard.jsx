import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { annualDaysUsedInYear, totalDaysUsedInYear, pendingRequestCount, upcomingRequests } from '../lib/leaveDashboard'
import { LEAVE_TYPE_OPTIONS, SPECIAL_LEAVE_TYPES, annualDaysSummary } from '../lib/leaveRequests'
import LeaveRequestForm from './LeaveRequestForm'
import { LeaveDateRange } from './DateCard'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

function emptyTracker() { return { approved: 0, pending: 0 } }

// "My leave" tab content — only ever rendered for a signed-in doctor
// (canSubmitLeave), gated by the caller. A personal leave tracker,
// upcoming own requests, and the submission form all in one place, rather
// than a separate "dashboard" tab plus a separate "submit" tab. Full
// request history (past + rejected, not just upcoming) lives on the
// "Requests" tab under Planners instead of being duplicated here.
export default function LeaveDashboard() {
  const { profile } = useAuth()
  const [annualTracker, setAnnualTracker] = useState(emptyTracker())
  const [specialTracker, setSpecialTracker] = useState(emptyTracker())
  const [sickTracker, setSickTracker] = useState(emptyTracker())
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

    const annualRows = rows.filter(r => r.leave_type === 'annual')
    const specialRows = rows.filter(r => SPECIAL_LEAVE_TYPES.includes(r.leave_type))
    const sickRows = rows.filter(r => r.leave_type === 'sick')

    setAnnualTracker({
      approved: annualDaysUsedInYear(annualRows.filter(r => r.status === 'approved'), year),
      pending: pendingRequestCount(annualRows, year),
    })
    setSpecialTracker({
      approved: totalDaysUsedInYear(specialRows.filter(r => r.status === 'approved'), year),
      pending: pendingRequestCount(specialRows, year),
    })
    setSickTracker({
      approved: totalDaysUsedInYear(sickRows.filter(r => r.status === 'approved'), year),
      pending: pendingRequestCount(sickRows, year),
    })
    setMyUpcoming(upcomingRequests(rows, today))
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink">Leave tracker</h2>
        {loading ? (
          <p className="mt-2 text-sm text-ink-muted">Loading…</p>
        ) : (
          <div className="mt-2 space-y-3">
            <TrackerRow label="Annual leave" tracker={annualTracker} />
            {/* Special/sick only shown once meaningfully used, so a doctor who's taken none of these isn't shown a wall of zeroes */}
            {specialTracker.approved > 1 && <TrackerRow label="Special leave" tracker={specialTracker} />}
            {sickTracker.approved > 1 && <TrackerRow label="Sick leave" tracker={sickTracker} />}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-muted">Resets to zero on 1 January each year.</p>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink">Upcoming</h2>
        {loading ? (
          <p className="mt-2 text-sm text-ink-muted">Loading…</p>
        ) : myUpcoming.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nothing upcoming.</p>
        ) : (
          <div className="mt-2 space-y-4">
            {myUpcoming.map(lr => (
              <div key={lr.id}>
                <p className="mb-1 text-xs font-medium text-ink-muted">{LEAVE_TYPE_LABELS[lr.leave_type]}</p>
                <LeaveDateRange dateFrom={lr.date_from} dateTo={lr.date_to} status={lr.status} compact />
                {annualDaysSummary(lr) && <p className="mt-1 text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

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

function TrackerRow({ label, tracker }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="text-sm text-ink">
        <span className="font-display text-2xl font-bold text-ink">{tracker.approved}</span>
        <span className="text-ink-muted"> days approved · {tracker.pending} request{tracker.pending === 1 ? '' : 's'} pending</span>
      </p>
    </div>
  )
}
