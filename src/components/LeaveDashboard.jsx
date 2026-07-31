import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { annualDaysUsedInYear, upcomingRequests } from '../lib/leaveDashboard'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

// Compact "at a glance" landing for the Leave page — replaces dropping
// straight into a tab full of requests/grids as the first thing every
// visitor sees. Personal allowance + upcoming requests for doctors, a
// "leave today" stat for everyone (RLS scopes both the away-today and
// pending counts correctly per role automatically — admin sees the real
// team-wide numbers, a doctor sees their own), and quick links into the
// other tabs rather than duplicating their content here.
export default function LeaveDashboard({ onNavigate }) {
  const { profile, canSubmitLeave, isAdmin } = useAuth()
  const canViewYearPlanners = isAdmin || canSubmitLeave
  const [allotted, setAllotted] = useState(null)
  const [approvedDays, setApprovedDays] = useState(0)
  const [pendingDays, setPendingDays] = useState(0)
  const [myUpcoming, setMyUpcoming] = useState([])
  const [awayToday, setAwayToday] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over changes within a session

  async function load() {
    setLoading(true)
    const today = todayStr()
    const year = new Date().getFullYear()

    const queries = [
      supabase.from('leave_requests').select('id').eq('status', 'approved').lte('date_from', today).gte('date_to', today),
      supabase.from('leave_requests').select('id').eq('status', 'pending'),
    ]
    if (canSubmitLeave) {
      queries.push(
        supabase.from('annual_leave_balances').select('days_allotted').eq('profile_id', profile.id).eq('year', year).maybeSingle(),
        supabase.from('leave_requests').select('date_from, date_to, status').eq('profile_id', profile.id).eq('leave_type', 'annual'),
        supabase.from('leave_requests').select('*').eq('profile_id', profile.id).order('date_from', { ascending: true }),
      )
    }
    const [awayRes, pendingRes, balanceRes, annualRes, mineRes] = await Promise.all(queries)

    setAwayToday((awayRes.data || []).length)
    setPendingCount((pendingRes.data || []).length)

    if (canSubmitLeave) {
      const annualRows = annualRes?.data || []
      setAllotted(balanceRes?.data?.days_allotted ?? null)
      setApprovedDays(annualDaysUsedInYear(annualRows.filter(r => r.status === 'approved'), year))
      setPendingDays(annualDaysUsedInYear(annualRows.filter(r => r.status === 'pending'), year))
      setMyUpcoming(upcomingRequests(mineRes?.data || [], today))
    }

    setLoading(false)
  }

  const remaining = allotted != null ? Math.max(0, allotted - approvedDays) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canSubmitLeave && (
          <button type="button" onClick={() => onNavigate('submit')} className="btn-primary text-sm">Request leave</button>
        )}
        <button type="button" onClick={() => onNavigate('team')} className="btn-secondary text-sm">View team calendar</button>
      </div>

      {canSubmitLeave && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Your allowance</h2>
          {loading ? (
            <p className="mt-2 text-sm text-ink-muted">Loading…</p>
          ) : allotted == null ? (
            <p className="mt-2 text-sm text-ink-muted">No annual leave allowance set for this year yet — ask an admin.</p>
          ) : (
            <p className="mt-2 text-sm text-ink">
              <span className="font-display text-2xl font-bold text-ink">{remaining}</span>
              <span className="text-ink-muted"> days remaining · {approvedDays} approved · {pendingDays} pending</span>
            </p>
          )}
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-ink">Leave today</h2>
        {loading ? (
          <p className="mt-2 text-sm text-ink-muted">Loading…</p>
        ) : (
          <p className="mt-2 text-sm text-ink-light">
            {awayToday} {awayToday === 1 ? 'doctor' : 'doctors'} away · {pendingCount} {pendingCount === 1 ? 'request' : 'requests'} pending{isAdmin ? '' : ' of yours'}
          </p>
        )}
      </div>

      {canSubmitLeave && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink">Upcoming</h2>
          {loading ? (
            <p className="mt-2 text-sm text-ink-muted">Loading…</p>
          ) : myUpcoming.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Nothing upcoming.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {myUpcoming.map(lr => (
                <div key={lr.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {LEAVE_TYPE_LABELS[lr.leave_type]} — {lr.date_from} → {lr.date_to}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
                    {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="label-text">Planners</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {canViewYearPlanners && (
            <>
              <button type="button" onClick={() => onNavigate('annual')} className="btn-secondary text-sm">Annual planner</button>
              <button type="button" onClick={() => onNavigate('special')} className="btn-secondary text-sm">Special requests</button>
            </>
          )}
          <Link to="/weekend" className="btn-secondary text-sm">Weekends</Link>
          {isAdmin && (
            <button type="button" onClick={() => onNavigate('queue')} className="btn-secondary text-sm">
              Approval queue{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
