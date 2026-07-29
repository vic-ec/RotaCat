import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getDashboardHoursWarnings } from '../lib/monthlyHours'
import { todayStr, addDays } from '../lib/dateRange'
import { splitByShiftStatus } from '../lib/shiftStatus'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

export default function DashboardPage() {
  const { profile, isAdmin, isClerk } = useAuth()
  const [myLeave, setMyLeave] = useState([])
  const [onLeaveNow, setOnLeaveNow] = useState([])
  const [onLeaveNext, setOnLeaveNext] = useState([])
  const [hoursWarnings, setHoursWarnings] = useState([])
  const [onShiftNow, setOnShiftNow] = useState([])
  const [startingSoon, setStartingSoon] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    if (isAdmin) loadAdminWidgets()
    else if (isClerk) loadClerkWidgets()
    else loadDoctorWidgets()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAdminWidgets/loadClerkWidgets/loadDoctorWidgets are redefined every render; including them would refetch in a loop
  }, [profile?.id, isAdmin, isClerk])

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

  // Clerks are read-only and have no personal shifts/leave of their own —
  // this replaces the doctor "my shifts/leave" widgets with a live team
  // status view instead: who's on shift right now, who's starting within
  // the next day, and who's currently on approved leave. roster_entries
  // RLS already restricts non-admins to published rosters only, and
  // leave_requests RLS restricts a clerk to approved leave that's active
  // today — both queries below are just being explicit about the same
  // windows on top of that.
  async function loadClerkWidgets() {
    setLoading(true)
    const now = new Date()
    const today = todayStr()
    const yesterday = addDays(today, -1)
    const tomorrow = addDays(today, 1)

    const [entriesRes, leaveRes] = await Promise.all([
      supabase
        .from('roster_entries')
        .select('date, profile_id, shift_type:shift_types(code, label, start_time, end_time), profile:profiles!roster_entries_profile_id_fkey(name, surname)')
        .gte('date', yesterday)
        .lte('date', tomorrow)
        .not('profile_id', 'is', null),
      supabase
        .from('leave_requests')
        .select('*, profiles!leave_requests_profile_id_fkey(name, surname)')
        .eq('status', 'approved')
        .lte('date_from', today)
        .gte('date_to', today),
    ])

    const { active, upcoming } = splitByShiftStatus(entriesRes.data || [], now, 24)
    setOnShiftNow(active)
    setStartingSoon(upcoming)
    setOnLeaveNow(leaveRes.data || [])
    setLoading(false)
  }

  async function loadAdminWidgets() {
    setLoading(true)
    const today = todayStr()

    const [leaveRes, profilesRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*, profiles!leave_requests_profile_id_fkey(name, surname)')
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
        {isAdmin
          ? 'Leave and hours overview for the team.'
          : isClerk
            ? 'Live team status — who\'s on shift, who\'s up next, who\'s on leave.'
            : 'Your upcoming shifts will appear here once the roster module is connected.'}
      </p>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && !isAdmin && !isClerk && (
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

      {!loading && isClerk && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link to="/roster" className="btn-secondary text-sm">Roster</Link>
            <Link to="/staff" className="btn-secondary text-sm">Staff</Link>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">Currently on shift</h2>
            {onShiftNow.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nobody currently rostered on.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink-light">
                {onShiftNow.map(e => (
                  <li key={`${e.date}-${e.profile_id}-${e.shift_type?.code}`}>
                    {e.profile?.name} {e.profile?.surname} — {e.shift_type?.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">Working in the next 24 hours</h2>
            {startingSoon.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing else coming up.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink-light">
                {startingSoon.map(e => (
                  <li key={`${e.date}-${e.profile_id}-${e.shift_type?.code}`}>
                    {e.profile?.name} {e.profile?.surname} — {e.shift_type?.label} ({e.date})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">On leave now</h2>
            {onLeaveNow.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nobody currently on approved leave.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink-light">
                {onLeaveNow.map(lr => (
                  <li key={lr.id}>
                    {lr.profiles?.name} {lr.profiles?.surname} — until {lr.date_to}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
