import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr } from '../lib/dateRange'
import { annualDaysUsedInYear, upcomingRequests } from '../lib/leaveDashboard'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import LeaveRequestForm from './LeaveRequestForm'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

// "My leave" tab content — only ever rendered for a signed-in doctor
// (canSubmitLeave), gated by the caller. Personal annual-leave allowance,
// upcoming own requests, and the submission form all in one place, rather
// than a separate "dashboard" tab plus a separate "submit" tab. Full
// request history (past + rejected, not just upcoming) lives on the
// "Requests" tab under Planners instead of being duplicated here.
export default function LeaveDashboard() {
  const { profile } = useAuth()
  const [allotted, setAllotted] = useState(null)
  const [approvedDays, setApprovedDays] = useState(0)
  const [pendingDays, setPendingDays] = useState(0)
  const [myUpcoming, setMyUpcoming] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; nothing it closes over changes within a session

  async function load() {
    setLoading(true)
    const today = todayStr()
    const year = new Date().getFullYear()

    const [balanceRes, annualRes, mineRes] = await Promise.all([
      supabase.from('annual_leave_balances').select('days_allotted').eq('profile_id', profile.id).eq('year', year).maybeSingle(),
      supabase.from('leave_requests').select('date_from, date_to, status').eq('profile_id', profile.id).eq('leave_type', 'annual'),
      supabase.from('leave_requests').select('*').eq('profile_id', profile.id).order('date_from', { ascending: true }),
    ])

    const annualRows = annualRes?.data || []
    setAllotted(balanceRes?.data?.days_allotted ?? null)
    setApprovedDays(annualDaysUsedInYear(annualRows.filter(r => r.status === 'approved'), year))
    setPendingDays(annualDaysUsedInYear(annualRows.filter(r => r.status === 'pending'), year))
    setMyUpcoming(upcomingRequests(mineRes?.data || [], today))
    setLoading(false)
  }

  const remaining = allotted != null ? Math.max(0, allotted - approvedDays) : null

  return (
    <div className="space-y-4">
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

      <div>
        <p className="label-text">Request leave</p>
        <div className="mt-1">
          <LeaveRequestForm onSubmitted={load} />
        </div>
      </div>
    </div>
  )
}
