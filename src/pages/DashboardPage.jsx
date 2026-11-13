import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getDashboardHoursWarnings } from '../lib/monthlyHours'
import { todayStr, addDays, formatShortDateRange, parseLocalDate } from '../lib/dateRange'
import { splitByShiftStatus } from '../lib/shiftStatus'
import { upcomingRequests, annualDaysUsedInYear, pendingRequestCount } from '../lib/leaveDashboard'
import { shortLeaveTypeLabel, ANNUAL_LEAVE_ALLOWANCE } from '../lib/leaveRequests'
import UpcomingBirthdays from '../components/UpcomingBirthdays'
import DateCard, { LeaveDateRange } from '../components/DateCard'
import LeaveCard from '../components/LeaveCard'

// Destinations the dashboard links out to. `MY_LEAVE` is the "My leave" tab
// of the Leave page (reachable from the Planners nav item too) — the
// dashboard's leave section is a preview of it, so every link out of that
// section lands on the same place.
const MY_LEAVE_PATH = '/leave?tab=my-leave'
const TEAM_LEAVE_PATH = '/leave?tab=team'
const LEAVE_REQUESTS_PATH = '/leave?tab=requests'
const HOURS_SUMMARY_PATH = '/roster?view=summary'
const SWAPS_PATH = '/swaps'

// The upcoming-shifts card shows at most this many rows of the week ahead.
const MAX_UPCOMING_ROWS = 5

// How far ahead "upcoming team leave" looks, for the admin view.
const TEAM_LEAVE_LOOKAHEAD_DAYS = 7

// An empty section collapses to this single row rather than a full-height
// card announcing that there's nothing to see — the state a doctor is in
// most of the time shouldn't cost the most screen space.
function EmptyRow({ children, to, linkLabel }) {
  return (
    <p className="card flex flex-wrap items-center gap-x-1.5 px-4 py-3 text-sm text-ink-muted">
      <span>{children}</span>
      {to && (
        <>
          <span aria-hidden="true">·</span>
          <Link to={to} className="font-medium text-accent hover:text-accent-dark">{linkLabel} ›</Link>
        </>
      )}
    </p>
  )
}

function SectionHeading({ children, to, linkLabel }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {to && (
        <Link to={to} className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark">
          {linkLabel} ›
        </Link>
      )}
    </div>
  )
}

function hourOnly(time) {
  return time ? time.slice(0, 2) : ''
}

// Which chip a shift's time takes (docs/app-theme/SPEC.md, Dashboard):
// night from is_night_shift — never inferred from the code or the hour —
// evening for a shift starting in the afternoon, mint for the rest.
function timeChipClass(shiftType) {
  if (shiftType?.is_night_shift === true) return 'chip-night'
  const start = Number(hourOnly(shiftType?.start_time))
  if (start >= 13) return 'chip-evening'
  return 'chip-mint'
}

// One row of the upcoming-shifts card: a 64px date cell (today's on the
// sheen), the shift and who else is on it, and the time chip.
function UpcomingShiftRow({ entry, coworkers, holidayName }) {
  const date = parseLocalDate(entry.date)
  const isToday = entry.date === todayStr()
  const st = entry.shift_type
  const line2 = [
    holidayName,
    coworkers.length > 0 ? `with ${coworkers.join(', ')}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <li className="flex items-stretch">
      <div
        className={`flex w-16 flex-shrink-0 flex-col items-center justify-center border-r py-2 text-center ${
          isToday ? 'sheen border-sheen' : 'border-slate-line'
        }`}
        style={isToday ? { borderColor: 'transparent' } : undefined}
      >
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-on-sheen-2' : 'text-ink-muted'}`}>
          {date.toLocaleDateString('en-GB', { weekday: 'short' })}
        </span>
        <span className={`text-[22px] font-semibold leading-tight ${isToday ? 'text-on-sheen' : 'text-ink'}`}>{date.getDate()}</span>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-on-sheen-2' : 'text-ink-muted'}`}>
          {date.toLocaleDateString('en-GB', { month: 'short' })}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">
            {st?.label || 'Shift'} · {hourOnly(st?.start_time)}h
          </p>
          {line2 && <p className="truncate text-[13px] text-ink-light">{line2}</p>}
        </div>
        {st?.start_time && st?.end_time && (
          <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${timeChipClass(st)}`}>
            {hourOnly(st.start_time)}–{hourOnly(st.end_time)}
          </span>
        )}
      </div>
    </li>
  )
}

// A "Needs attention" row (admin) — a whole-row link, not a sheet trigger:
// both of these are things the admin has to go and act on, so tapping one
// should land them where the acting happens.
function AttentionRow({ to, count, label }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas-cool">
      <span className="flex items-baseline gap-3">
        <span className="font-display text-xl font-bold text-ink">{count}</span>
        <span className="text-sm text-ink-light">{label}</span>
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
    </Link>
  )
}

function fullName(person) {
  return [person?.name, person?.surname].filter(Boolean).join(' ')
}

export default function DashboardPage() {
  const { profile, isAdmin, isClerk, isLocum } = useAuth()
  const [myLeave, setMyLeave] = useState([])
  const [myShifts, setMyShifts] = useState([])
  const [coworkersByKey, setCoworkersByKey] = useState({})
  const [annualBalance, setAnnualBalance] = useState({ booked: 0, pending: 0 })
  const [phByDate, setPhByDate] = useState({})
  const [incomingSwaps, setIncomingSwaps] = useState([])
  const [swapError, setSwapError] = useState('')
  const [onLeaveNow, setOnLeaveNow] = useState([])
  const [onLeaveNext, setOnLeaveNext] = useState([])
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0)
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
  //
  // is_night_shift comes back with the row because it decides the shift
  // card's time-panel colour — the one thing that must never be inferred
  // from the shift code or start hour.
  async function loadOwnUpcomingShifts() {
    const { data } = await supabase
      .from('roster_entries')
      .select('date, shift_type:shift_types(code, label, start_time, end_time, day_type, is_night_shift)')
      .eq('profile_id', profile.id)
      .gte('date', todayStr())
      .lte('date', addDays(todayStr(), 6))
      .order('date', { ascending: true })
    return (data || []).filter(e => !e.profile_id || e.profile_id === profile.id)
  }

  // Everyone else on the published roster in the same window, keyed by
  // date + shift code, so a row can say who else is on that slot. Same RLS
  // as above: only published entries ever come back.
  async function loadCoworkersThisWeek() {
    const { data } = await supabase
      .from('roster_entries')
      .select('date, profile_id, shift_type:shift_types(code), profile:profiles!roster_entries_profile_id_fkey(surname)')
      .gte('date', todayStr())
      .lte('date', addDays(todayStr(), 6))
      .not('profile_id', 'is', null)
    const map = {}
    for (const row of data || []) {
      if (!row.profile_id || row.profile_id === profile.id || !row.profile?.surname) continue
      const key = `${row.date}|${row.shift_type?.code}`
      ;(map[key] ||= []).push(row.profile.surname)
    }
    return map
  }

  // Annual leave this calendar year, for the leave card's "N days left ·
  // M of 22 booked · P pending" — the same figures the My leave tab shows.
  // All statuses are fetched so the pending count comes from the same rows.
  async function loadAnnualBalance() {
    const year = new Date().getFullYear()
    const { data } = await supabase
      .from('leave_requests')
      .select('date_from, date_to, annual_leave_days, leave_type, status')
      .eq('profile_id', profile.id)
      .eq('leave_type', 'annual')
      .gte('date_to', `${year}-01-01`)
      .lte('date_from', `${year}-12-31`)
    const annualRows = (data || []).filter(r => r.leave_type === 'annual')
    return {
      booked: annualDaysUsedInYear(annualRows.filter(r => r.status === 'approved'), year),
      pending: pendingRequestCount(annualRows, year),
    }
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

  // Only swaps *waiting on this person* — someone else asked, and nothing
  // happens until they answer. Swaps they themselves requested (and swaps
  // already accepted, waiting on an admin) are status information, not a
  // task, and the old "either side, pending or accepted" list couldn't tell
  // the two apart: an empty-looking card and a card needing a decision
  // looked identical. Everything else about a swap lives on the Swaps page.
  async function loadIncomingSwaps() {
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        id, status, requester_id, target_id,
        requester:profiles!swap_requests_requester_id_fkey(name, surname),
        requester_entry:roster_entries!swap_requests_requester_entry_id_fkey(date, shift_type:shift_types(label, start_time, end_time, is_night_shift)),
        target_entry:roster_entries!swap_requests_target_entry_id_fkey(date, shift_type:shift_types(label, start_time, end_time, is_night_shift))
      `)
      .eq('target_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    return data || []
  }

  // Accepting hands the swap to an admin for final sign-off ('accepted' is
  // "awaiting admin", not "done"); declining ends it. Either way the row
  // leaves this list, since it's no longer waiting on this person.
  async function respondToSwap(swapId, status) {
    setSwapError('')
    const { error } = await supabase.from('swap_requests').update({ status }).eq('id', swapId)
    if (error) {
      setSwapError('Couldn\'t update that swap request. Please try again.')
      return
    }
    setIncomingSwaps(prev => prev.filter(sw => sw.id !== swapId))
  }

  // Doctor sees own leave only — an intentional narrower scope than the
  // Leave Planner's "Team leave" list, which relies on RLS for the full
  // per-role view. This dashboard widget always self-filters on top of it.
  // Upcoming only (date_to >= today): leave already taken is history, and
  // the "My leave" tracker is where it's accounted for.
  async function loadDoctorWidgets() {
    setLoading(true)
    const today = todayStr()
    const [leaveRes, shifts, coworkers, ph, swaps, annualUsed] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*')
        .eq('profile_id', profile.id)
        .gte('date_to', today)
        .order('date_from', { ascending: true })
        .limit(10),
      loadOwnUpcomingShifts(),
      loadCoworkersThisWeek(),
      loadPublicHolidaysThisWeek(),
      loadIncomingSwaps(),
      loadAnnualBalance(),
    ])
    setMyLeave(upcomingRequests(leaveRes.data || [], today))
    setMyShifts(shifts)
    setCoworkersByKey(coworkers)
    setPhByDate(ph)
    setIncomingSwaps(swaps)
    setAnnualBalance(annualUsed)
    setLoading(false)
  }

  // Locums can't submit leave (leave_requests RLS excludes them entirely),
  // so there's no leave widget for this role -- just their own upcoming
  // shifts on the published roster (plus swaps, which locums can do too).
  async function loadLocumWidgets() {
    setLoading(true)
    const [shifts, coworkers, ph, swaps] = await Promise.all([
      loadOwnUpcomingShifts(),
      loadCoworkersThisWeek(),
      loadPublicHolidaysThisWeek(),
      loadIncomingSwaps(),
    ])
    setMyShifts(shifts)
    setCoworkersByKey(coworkers)
    setPhByDate(ph)
    setIncomingSwaps(swaps)
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

  // Admin: counts first, names second. The two "needs attention" numbers are
  // work queues (pending approvals, hours ceilings); team leave is awareness.
  // The hours count reads the same live roster_entries figures the Hours
  // Summary shows (monthlyHours.js) — monthly_stats has no rows yet, so
  // nothing here reads it.
  async function loadAdminWidgets() {
    setLoading(true)
    const today = todayStr()

    const [pendingRes, leaveRes, profilesRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('leave_requests')
        .select('*, profiles!leave_requests_profile_id_fkey(name, surname)')
        .eq('status', 'approved')
        .gte('date_to', today)
        .order('date_from', { ascending: true })
        .limit(50),
      supabase
        .from('profiles')
        .select('id, name, surname, contract_type')
        .eq('is_approved', true)
        .eq('is_active', true)
        .neq('category', 'Consultant'),
    ])

    setPendingLeaveCount(pendingRes.count || 0)

    const rows = leaveRes.data || []
    const lookaheadEnd = addDays(today, TEAM_LEAVE_LOOKAHEAD_DAYS)
    setOnLeaveNow(rows.filter(r => r.date_from <= today && today <= r.date_to))
    setOnLeaveNext(rows.filter(r => r.date_from > today && r.date_from <= lookaheadEnd))

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
                  : 'Here\'s what\'s happening.'}
          </p>
        </div>
        {/* Doctor/locum/admin views put birthdays last in the stack instead — see below. */}
        {isClerk && <UpcomingBirthdays />}
      </div>

      {loading && <p className="mt-6 text-sm text-ink-muted">Loading…</p>}

      {!loading && !isAdmin && !isClerk && (
        <div className="mt-6 space-y-6">
          {/* 1. Next shifts */}
          <section>
            {/* Heading sits on the plain page background; the chips get
                their own panel underneath, so the row of shift cards reads
                as one object rather than chips floating loose. Unlike the
                other sections, this one keeps its heading and its roster
                link even with nothing rostered — the week ahead being empty
                is itself worth stating under a heading, and the link out is
                exactly what someone with no shifts wants. The empty message
                sits inside the panel, in place of the chips. */}
            <SectionHeading to="/roster" linkLabel="View roster">Upcoming shifts</SectionHeading>
            {myShifts.length === 0 ? (
              <p className="card p-4 text-sm text-ink-muted">No shifts in the next 7 days</p>
            ) : (
              <ul className="card divide-y divide-slate-line overflow-hidden">
                {myShifts.slice(0, MAX_UPCOMING_ROWS).map(e => {
                  const isPH = e.shift_type?.day_type === 'PH' || e.shift_type?.day_type === 'PH_weekday'
                  return (
                    <UpcomingShiftRow
                      key={`${e.date}-${e.shift_type?.code}`}
                      entry={e}
                      coworkers={coworkersByKey[`${e.date}|${e.shift_type?.code}`] || []}
                      holidayName={isPH ? (phByDate[e.date] || 'Public holiday') : null}
                    />
                  )
                })}
              </ul>
            )}
          </section>

          {/* 2. Leave — one card, two columns (stacked on a phone): the
              annual balance on the left, the next upcoming request on the
              right. My leave has the full list; this is the summary. */}
          {!isLocum && (
            <section>
              <SectionHeading to={MY_LEAVE_PATH} linkLabel="View all leave">Leave</SectionHeading>
              <div className="card grid divide-y divide-slate-line overflow-hidden sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="p-4">
                  <p className="text-xs font-medium text-ink-muted">Annual leave · {new Date().getFullYear()}</p>
                  <p className="mt-1">
                    <span className="font-display text-3xl font-bold text-ink">{ANNUAL_LEAVE_ALLOWANCE - annualBalance.booked}</span>
                    <span className="ml-1.5 text-sm text-ink-muted">days left</span>
                  </p>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-sunken"
                    role="progressbar"
                    aria-label="Annual leave booked"
                    aria-valuemin={0}
                    aria-valuemax={ANNUAL_LEAVE_ALLOWANCE}
                    aria-valuenow={annualBalance.booked}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, (annualBalance.booked / ANNUAL_LEAVE_ALLOWANCE) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {annualBalance.booked} of {ANNUAL_LEAVE_ALLOWANCE} booked · {annualBalance.pending} pending
                  </p>
                </div>
                <div className="p-4">
                  <p className="mb-2 text-xs font-medium text-ink-muted">Next leave</p>
                  {myLeave.length === 0 ? (
                    <p className="text-sm text-ink-muted">None booked</p>
                  ) : (
                    <>
                      <LeaveCard request={myLeave[0]} bare />
                      {myLeave.length > 1 && (
                        <Link to={MY_LEAVE_PATH} className="mt-2 inline-block text-xs font-medium text-accent hover:text-accent-dark">
                          +{myLeave.length - 1} more upcoming ›
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Quick actions — the two things a doctor comes here to start. */}
          <div className="grid grid-cols-2 gap-3">
            {!isLocum && <Link to={MY_LEAVE_PATH} className="btn-primary py-2.5">Request leave</Link>}
            <Link to={SWAPS_PATH} className={`btn-secondary py-2.5 ${isLocum ? 'col-span-2' : ''}`}>Request swap</Link>
          </div>

          {/* 3. Shift swaps — only when one is actually waiting on an answer */}
          {incomingSwaps.length > 0 && (
            <section>
              <SectionHeading>Swap requests for you</SectionHeading>
              <div className="space-y-3">
                {incomingSwaps.map(sw => (
                  <div key={sw.id} className="card p-4">
                    <p className="text-sm font-semibold text-ink">
                      {fullName(sw.requester) || 'A colleague'} wants to swap with you
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <SwapShift label="Their shift" entry={sw.requester_entry} />
                      <ArrowLeftRight className="h-4 w-4 flex-shrink-0 text-ink-muted" aria-hidden="true" />
                      <SwapShift label="Your shift" entry={sw.target_entry} />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button type="button" className="btn-success text-sm" onClick={() => respondToSwap(sw.id, 'accepted')}>
                        Accept
                      </button>
                      <button type="button" className="btn-danger-outline text-sm" onClick={() => respondToSwap(sw.id, 'rejected')}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {swapError && <p className="mt-2 text-sm text-flagRed">{swapError}</p>}
            </section>
          )}

          {/* 4. Birthdays — renders nothing at all when the window is empty */}
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
              <div className="mt-3 space-y-4">
                {onLeaveNow.map(lr => (
                  <div key={lr.id}>
                    <p className="mb-1 text-xs font-medium text-ink-muted">{lr.profiles?.name} {lr.profiles?.surname}</p>
                    <LeaveDateRange dateFrom={lr.date_from} dateTo={lr.date_to} compact />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && isAdmin && (
        <div className="mt-6 space-y-6">
          {/* Needs attention — counts that are someone's job today, each row
              a link to where that job gets done. Rows with a count of zero
              aren't work, so they don't render. */}
          <section>
            {pendingLeaveCount === 0 && hoursWarnings.length === 0 ? (
              <EmptyRow to={LEAVE_REQUESTS_PATH} linkLabel="View requests">Nothing needs your attention</EmptyRow>
            ) : (
              <>
                <SectionHeading>Needs attention</SectionHeading>
                <div className="card divide-y divide-slate-line">
                  {pendingLeaveCount > 0 && (
                    <AttentionRow
                      to={LEAVE_REQUESTS_PATH}
                      count={pendingLeaveCount}
                      label={`leave request${pendingLeaveCount === 1 ? '' : 's'} awaiting approval`}
                    />
                  )}
                  {hoursWarnings.length > 0 && (
                    <AttentionRow
                      to={HOURS_SUMMARY_PATH}
                      count={hoursWarnings.length}
                      label={`${hoursWarnings.length === 1 ? 'doctor is' : 'doctors are'} at or over the hours ceiling this month`}
                    />
                  )}
                </div>
              </>
            )}
          </section>

          {/* Team leave now — read-only awareness, one line plus names */}
          <section>
            {onLeaveNow.length === 0 ? (
              <EmptyRow to={TEAM_LEAVE_PATH} linkLabel="View team leave">Nobody away today</EmptyRow>
            ) : (
              <div className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">{onLeaveNow.length} away today</h2>
                  <Link to={TEAM_LEAVE_PATH} className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark">
                    View team leave ›
                  </Link>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {onLeaveNow.map(lr => `${fullName(lr.profiles)} · ${shortLeaveTypeLabel(lr.leave_type)}`).join(', ')}
                </p>
              </div>
            )}
          </section>

          {onLeaveNext.length > 0 && (
            <section>
              <div className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink">
                    {onLeaveNext.length} away in the next {TEAM_LEAVE_LOOKAHEAD_DAYS} days
                  </h2>
                  <Link to={TEAM_LEAVE_PATH} className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark">
                    View team leave ›
                  </Link>
                </div>
                {/* One row per person, not a comma-run: each entry carries a
                    name, a leave type AND a date range, so three or four of
                    them joined into a single paragraph became a wall of
                    commas with no scannable boundary between people. */}
                <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
                  {onLeaveNext.map(lr => (
                    <li key={lr.id}>
                      {fullName(lr.profiles)} · {shortLeaveTypeLabel(lr.leave_type)} ({formatShortDateRange(lr.date_from, lr.date_to)})
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <UpcomingBirthdays />
        </div>
      )}
    </div>
  )
}

// One side of a swap — the shift chip plus whose it is. Uses the same
// DateCard as the shifts section above (times on a coloured footer, night
// shifts read off is_night_shift), so a shift looks like a shift wherever
// it appears on this page.
function SwapShift({ label, entry }) {
  if (!entry) return <p className="text-sm text-ink-muted">{label}: unavailable</p>
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <DateCard
        date={entry.date}
        startTime={entry.shift_type?.start_time}
        endTime={entry.shift_type?.end_time}
        night={entry.shift_type?.is_night_shift === true}
      />
    </div>
  )
}
