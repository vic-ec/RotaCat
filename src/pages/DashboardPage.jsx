import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getDashboardHoursWarnings } from '../lib/monthlyHours'
import { todayStr, addDays } from '../lib/dateRange'
import { splitByShiftStatus } from '../lib/shiftStatus'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'
import UpcomingBirthdays from '../components/UpcomingBirthdays'
import DateCard, { LeaveDateRange } from '../components/DateCard'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

// Swap requests aren't finalized (still awaiting the other doctor and/or
// admin) for these two statuses — accepted/rejected/admin_approved/
// cancelled swaps have already resolved and don't belong on the dashboard.
const OPEN_SWAP_STATUSES = ['pending', 'accepted']
const SWAP_STATUS_LABELS = { pending: 'Pending', accepted: 'Awaiting admin' }
const SWAP_STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  accepted: 'bg-flagBlue-bg text-flagBlue',
}

export default function DashboardPage() {
  const { profile, isAdmin, isClerk, isLocum } = useAuth()
  const [myLeave, setMyLeave] = useState([])
  const [myShifts, setMyShifts] = useState([])
  const [phByDate, setPhByDate] = useState({})
  const [mySwaps, setMySwaps] = useState([])
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
    else if (isLocum) loadLocumWidgets()
    else loadDoctorWidgets()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAdminWidgets/loadClerkWidgets/loadLocumWidgets/loadDoctorWidgets are redefined every render; including them would refetch in a loop
  }, [profile?.id, isAdmin, isClerk, isLocum])

  // roster_entries RLS restricts non-admins to published-roster rows only
  // (roster_entries_select: rm.status = 'published' OR is_admin()), so this
  // own-shifts query is published-only by construction, not just by app
  // convention -- a draft assignment never comes back here even if the
  // profile_id matches. Scoped to the week ahead (today through +6 days)
  // rather than "next 10 shifts", per the dashboard's own framing.
  async function loadOwnUpcomingShifts() {
    const { data } = await supabase
      .from('roster_entries')
      .select('date, shift_type:shift_types(code, label, start_time, end_time, day_type)')
      .eq('profile_id', profile.id)
      .gte('date', todayStr())
      .lte('date', addDays(todayStr(), 6))
      .order('date', { ascending: true })
    return data || []
  }

  // PH/PH_weekday shift rows get a calendar-icon button showing the actual
  // holiday name — fetched over the same 7-day window as the shifts above.
  async function loadPublicHolidaysThisWeek() {
    const { data } = await supabase
      .from('public_holidays')
      .select('date, name')
      .gte('date', todayStr())
      .lte('date', addDays(todayStr(), 6))
    const map = {}
    for (const ph of data || []) map[ph.date?.slice(0, 10)] = ph.name
    return map
  }

  // Swap requests this doctor/locum is party to (either side) that haven't
  // resolved yet. The Swaps page itself is still a placeholder (no request
  // workflow shipped yet), so this reads as empty today — wired up ahead of
  // that phase rather than after it.
  async function loadMySwaps() {
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        id, status, requester_id, target_id,
        requester:profiles!swap_requests_requester_id_fkey(name, surname),
        target:profiles!swap_requests_target_id_fkey(name, surname),
        requester_entry:roster_entries!swap_requests_requester_entry_id_fkey(date, shift_type:shift_types(label)),
        target_entry:roster_entries!swap_requests_target_entry_id_fkey(date, shift_type:shift_types(label))
      `)
      .or(`requester_id.eq.${profile.id},target_id.eq.${profile.id}`)
      .in('status', OPEN_SWAP_STATUSES)
      .order('created_at', { ascending: false })
    return data || []
  }

  // Doctor sees own leave only — an intentional narrower scope than the
  // Leave Planner's "Team leave" list, which relies on RLS for the full
  // per-role view. This dashboard widget always self-filters on top of it.
  async function loadDoctorWidgets() {
    setLoading(true)
    const [leaveRes, shifts, ph, swaps] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*')
        .eq('profile_id', profile.id)
        .order('date_from', { ascending: false })
        .limit(10),
      loadOwnUpcomingShifts(),
      loadPublicHolidaysThisWeek(),
      loadMySwaps(),
    ])
    setMyLeave(leaveRes.data || [])
    setMyShifts(shifts)
    setPhByDate(ph)
    setMySwaps(swaps)
    setLoading(false)
  }

  // Locums can't submit leave (leave_requests RLS excludes them entirely),
  // so there's no leave widget for this role -- just their own upcoming
  // shifts on the published roster (plus swaps, which locums can do too).
  async function loadLocumWidgets() {
    setLoading(true)
    const [shifts, ph, swaps] = await Promise.all([
      loadOwnUpcomingShifts(),
      loadPublicHolidaysThisWeek(),
      loadMySwaps(),
    ])
    setMyShifts(shifts)
    setPhByDate(ph)
    setMySwaps(swaps)
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
    <div className="mx-auto max-w-7xl md:max-w-2xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">
            Welcome, {profile?.name || 'there'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isAdmin
              ? 'Leave and hours overview for the team.'
              : isClerk
                ? 'Live team status — who\'s on shift, who\'s up next, who\'s on leave.'
                : isLocum
                  ? 'Your upcoming shifts on the published roster.'
                  : 'Your upcoming shifts and leave.'}
          </p>
        </div>
        {/* Doctor/locum view moves this under Your Shift Swaps instead — see below. */}
        {(isAdmin || isClerk) && <UpcomingBirthdays />}
      </div>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && !isAdmin && !isClerk && (
        <div className="mt-6 space-y-4">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">Your upcoming shifts for the week ahead</h2>
            {myShifts.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No upcoming shifts in the next 7 days.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                {myShifts.map(e => {
                  const isPH = e.shift_type?.day_type === 'PH' || e.shift_type?.day_type === 'PH_weekday'
                  return (
                    <DateCard
                      key={`${e.date}-${e.shift_type?.code}`}
                      date={e.date}
                      startTime={e.shift_type?.start_time}
                      endTime={e.shift_type?.end_time}
                      publicHoliday={isPH && (phByDate[e.date] || true)}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {!isLocum && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-ink">Your leave</h2>
              {myLeave.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No leave requests on record.</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {myLeave.map(lr => (
                    <div key={lr.id}>
                      <p className="mb-1 text-xs font-medium text-ink-muted">{LEAVE_TYPE_LABELS[lr.leave_type]}</p>
                      <LeaveDateRange dateFrom={lr.date_from} dateTo={lr.date_to} status={lr.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-ink">Your Shift Swaps</h2>
            {mySwaps.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No pending swap requests.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {mySwaps.map(sw => {
                  const isRequester = sw.requester_id === profile.id
                  const counterpart = isRequester ? sw.target : sw.requester
                  const yourEntry = isRequester ? sw.requester_entry : sw.target_entry
                  const theirEntry = isRequester ? sw.target_entry : sw.requester_entry
                  return (
                    <div key={sw.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">
                        Your {yourEntry?.date} {yourEntry?.shift_type?.label} ↔ {counterpart?.name} {counterpart?.surname}&apos;s {theirEntry?.date} {theirEntry?.shift_type?.label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SWAP_STATUS_BADGE[sw.status]}`}>
                        {SWAP_STATUS_LABELS[sw.status]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <UpcomingBirthdays />
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
