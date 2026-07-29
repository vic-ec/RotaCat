import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getDashboardHoursWarnings } from '../lib/monthlyHours'
import { todayStr } from '../lib/dateRange'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth()
  const [myLeave, setMyLeave] = useState([])
  const [onLeaveNow, setOnLeaveNow] = useState([])
  const [onLeaveNext, setOnLeaveNext] = useState([])
  const [hoursWarnings, setHoursWarnings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    if (isAdmin) loadAdminWidgets()
    else loadDoctorWidgets()
  }, [profile?.id, isAdmin])

  // Doctor sees own leave only — an intentional narrower scope than the
  // Leave Planner's "Team leave" list, which relies on RLS for the full
  // per-role view. This dashboard widget always self-filters on top of it.
  async function loadDoctorWidgets() {
    setLoading(true)
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('profile_id', profile.id)
      .order('date_from', { ascending: false })
      .limit(10)
    setMyLeave(data || [])
    setLoading(false)
  }

  async function loadAdminWidgets() {
    setLoading(true)
    const today = todayStr()

    const [leaveRes, profilesRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*, profiles(name, surname)')
        .eq('status', 'approved')
        .gte('date_to', today)
        .order('date_from', { ascending: true })
        .limit(20),
      supabase
        .from('profiles')
        .select('id, name, surname, contract_type')
        .eq('is_approved', true)
        .eq('is_active', true)
        .neq('category', 'Consultant'),
    ])

    const rows = leaveRes.data || []
    setOnLeaveNow(rows.filter(r => r.date_from <= today && today <= r.date_to))
    setOnLeaveNext(rows.filter(r => r.date_from > today))

    const now = new Date()
    const warnings = await getDashboardHoursWarnings(profilesRes.data || [], { year: now.getFullYear(), month: now.getMonth() + 1 })
    setHoursWarnings(warnings)

    setLoading(false)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">
        Welcome, {profile?.name || 'there'}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isAdmin ? 'Leave and hours overview for the team.' : 'Your upcoming shifts will appear here once the roster module is connected.'}
      </p>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && !isAdmin && (
        <div className="card mt-6 p-6">
          <h2 className="text-sm font-semibold text-ink">Your leave</h2>
          {myLeave.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No leave requests on record.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {myLeave.map(lr => (
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

      {!loading && isAdmin && (
        <div className="mt-6 space-y-4">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">On leave now</h2>
            {onLeaveNow.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nobody currently on approved leave.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink-light">
                {onLeaveNow.map(lr => (
                  <li key={lr.id}>
                    {lr.profiles?.name} {lr.profiles?.surname} — {LEAVE_TYPE_LABELS[lr.leave_type]} until {lr.date_to}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">On leave next</h2>
            {onLeaveNext.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing else approved and upcoming.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink-light">
                {onLeaveNext.slice(0, 8).map(lr => (
                  <li key={lr.id}>
                    {lr.profiles?.name} {lr.profiles?.surname} — {LEAVE_TYPE_LABELS[lr.leave_type]}, {lr.date_from} → {lr.date_to}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hoursWarnings.length > 0 && (
            <div className="card border-flagAmber bg-flagAmber-bg p-6">
              <h2 className="text-sm font-semibold text-flagAmber">Hours ceiling warning — this month</h2>
              <ul className="mt-2 space-y-1 text-sm text-flagAmber">
                {hoursWarnings.map(w => (
                  <li key={w.profileId}>
                    {w.name} {w.surname} — {w.hours}h rostered (ceiling: {w.ceiling}h)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
