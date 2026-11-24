// The admin dashboard's "Needs attention" rows beyond pending leave and
// hours-over-ceiling: things only an admin can act on, each with somewhere
// to go and do it. A row exists only while its count is above zero.
//
// `buildAttentionItems` is pure (and tested); `fetchAdminAttention` is the
// thin Supabase read around it. Every query is best-effort — a failed read
// drops that row rather than the whole panel.

import { supabase } from './supabase'
import { todayStr } from './dateRange'
import { saturdaysInMonth } from './weekendPlanner'
import { endOfRotationFlag } from './internRotations'
import { getMonthlyHoursByProfile } from './monthlyHours'
import { OPEN_LOCUM_LABEL } from './locumCover'
import { fetchMonthMinimums, MINIMUM_PROFILE_FIELDS } from './contractMinimum'

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const plural = (n, one, many) => (n === 1 ? one : many)

export function nextMonthOf(year, month) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

// Pure. `data`:
//   year, month              — the current month
//   rosters                  — non-deleted roster_months rows {id, year, month, status}
//   locumCountByRosterId     — {rosterId: unfilled (locum placeholder) shifts}
//   plannedSaturdays         — Set of next month's Saturdays that have anyone planned
//   pendingSignups, accountRequests, neverSignedIn — counts
//   rotationsEnding          — doctors whose last rotation ends this month with nothing after
//   underMinimum             — doctors rostered below their contracted minimum this month
// Pure: rostered shifts from today on whose doctor holds approved leave
// over the date — the doctor is still on the shift and nobody has
// decided on cover. Entries: { id, date, roster_month_id, profile_id };
// leave: { profile_id, date_from, date_to }. Earliest first.
export function shiftsOnLeave(entries, leave, today) {
  const byProfile = new Map()
  for (const l of leave || []) {
    if (!byProfile.has(l.profile_id)) byProfile.set(l.profile_id, [])
    byProfile.get(l.profile_id).push([l.date_from.slice(0, 10), l.date_to.slice(0, 10)])
  }
  return (entries || [])
    .map(e => ({ ...e, date: e.date.slice(0, 10) }))
    .filter(e => e.date >= today && (byProfile.get(e.profile_id) || []).some(([f, t]) => e.date >= f && e.date <= t))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function buildAttentionItems(data) {
  const { year, month } = data
  const next = nextMonthOf(year, month)
  const items = []

  // 0. A doctor on approved leave still holding a published shift: the
  //    shift has nobody working it until cover is arranged. Links to the
  //    earliest, with its cover form open.
  if (data.shiftsOnLeave?.length > 0) {
    const first = data.shiftsOnLeave[0]
    const n = data.shiftsOnLeave.length
    items.push({
      key: 'shifts-on-leave', count: n,
      to: `/roster/${first.roster_month_id}?date=${first.date}&doctor=${first.profile_id}&mode=edit&cover=1`,
      label: `rostered ${plural(n, 'shift needs', 'shifts need')} cover — the doctor is on leave`,
    })
  }
  const isCurrentOrLater = r => r.year > year || (r.year === year && r.month >= month)

  // 1. Unfilled shifts in a published roster, this month onward — a
  //    published roster is what doctors are working from, so a placeholder
  //    in it is a shift nobody is actually covering yet.
  for (const r of [...data.rosters].sort((a, b) => a.year - b.year || a.month - b.month)) {
    if (r.status !== 'published' || !isCurrentOrLater(r)) continue
    const count = data.locumCountByRosterId[r.id] || 0
    if (count > 0) {
      items.push({
        key: `locums-${r.id}`, count, to: `/roster/${r.id}`,
        label: `locum ${plural(count, 'placeholder', 'placeholders')} unfilled in ${MONTH_NAMES[r.month]}'s published roster`,
      })
    }
  }

  // 2. A roster that isn't out yet — this month's (already overdue) and
  //    next month's — still a draft, or not started at all.
  for (const [slot, m] of [['this', { year, month }], ['next', next]]) {
    const roster = data.rosters.find(r => r.year === m.year && r.month === m.month)
    if (!roster) {
      items.push({ key: `${slot}-roster-missing`, to: '/roster', label: `${MONTH_NAMES[m.month]} has no roster yet` })
    } else if (roster.status === 'draft') {
      items.push({ key: `${slot}-roster-draft`, to: `/roster/${roster.id}`, label: `${MONTH_NAMES[m.month]}'s roster is still a draft` })
    }
  }

  // 3. Weekend Planner gaps for next month — the engine won't generate a
  //    month with an empty weekend.
  const gaps = saturdaysInMonth(next.year, next.month).filter(sat => !data.plannedSaturdays.has(sat)).length
  if (gaps > 0) {
    items.push({
      key: 'weekend-gaps', count: gaps, to: '/leave?tab=planners&sub=weekends',
      label: `${plural(gaps, 'weekend', 'weekends')} in ${MONTH_NAMES[next.month]} ${plural(gaps, 'has', 'have')} nobody planned`,
    })
  }

  // 4–5. People waiting on an admin.
  if (data.pendingSignups > 0) {
    items.push({
      key: 'signups', count: data.pendingSignups, to: '/staff?tab=requests&sub=new-users',
      label: `${plural(data.pendingSignups, 'sign-up', 'sign-ups')} awaiting approval`,
    })
  }
  if (data.locumContacts > 0) {
    items.push({
      key: 'locum-contacts', count: data.locumContacts, to: '/staff?tab=requests&sub=new-users',
      label: `rostered ${plural(data.locumContacts, 'locum', 'locums')} needing ${data.locumContacts === 1 ? 'an account' : 'accounts'}`,
    })
  }
  if (data.accountRequests > 0) {
    items.push({
      key: 'account-requests', count: data.accountRequests, to: '/staff?tab=requests&sub=user-requests',
      label: `account change ${plural(data.accountRequests, 'request', 'requests')} to review`,
    })
  }

  // 6. Rotations running out with nothing lined up after them.
  if (data.rotationsEnding > 0) {
    items.push({
      key: 'rotations-ending', count: data.rotationsEnding, to: '/leave?tab=planners&sub=interns',
      label: `${plural(data.rotationsEnding, 'rotation ends', 'rotations end')} this month with nothing after`,
    })
  }

  // 7. Accounts an admin created that nobody has signed in to.
  if (data.neverSignedIn > 0) {
    items.push({
      key: 'never-signed-in', count: data.neverSignedIn, to: '/staff?tab=accounts',
      label: `${plural(data.neverSignedIn, 'account has', 'accounts have')} not signed in yet`,
    })
  }

  // 8. Rostered below their contracted minimum this month.
  if (data.underMinimum > 0) {
    items.push({
      key: 'under-minimum', count: data.underMinimum, to: '/roster?view=summary&hours=under',
      label: `${plural(data.underMinimum, 'doctor is', 'doctors are')} under their contracted hours this month`,
    })
  }

  return items
}

// Doctors under their minimum for a month that HAS a roster. The minimum
// is the month's own (lib/contractMinimum.js): lowered for leave, for days
// not yet (or no longer) in the EC, and by the engine's own variance.
export function countUnderMinimum({ profiles, hoursByProfile, minimums }) {
  return profiles.filter(p => {
    const min = minimums.get(p.id)?.minimum || 0
    if (!min) return false
    return (hoursByProfile.get(p.id) || 0) < min
  }).length
}

const safe = async (promise, fallback) => {
  try {
    const res = await promise
    return res?.error ? fallback : res
  } catch {
    return fallback
  }
}

export async function fetchAdminAttention(now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const next = nextMonthOf(year, month)
  const today = todayStr()
  const nextSaturdays = saturdaysInMonth(next.year, next.month)
  const empty = { data: [], count: 0 }

  const [rostersRes, plannerRes, signupsRes, requestsRes, locumContactsRes, neverRes, doctorsRes, rotatingRes] = await Promise.all([
    safe(supabase.from('roster_months').select('id, year, month, status').is('deleted_at', null).gte('year', year), empty),
    nextSaturdays.length > 0
      ? safe(supabase.from('weekend_planner_entries').select('weekend_saturday')
          .gte('weekend_saturday', nextSaturdays[0]).lte('weekend_saturday', nextSaturdays[nextSaturdays.length - 1]), empty)
      : empty,
    safe(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', false).eq('is_rejected', false), empty),
    safe(supabase.from('account_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'), empty),
    safe(supabase.from('locum_contacts').select('id', { count: 'exact', head: true }).is('linked_profile_id', null), empty),
    safe(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', true).eq('must_change_password', true), empty),
    safe(supabase.from('profiles').select(MINIMUM_PROFILE_FIELDS).eq('role', 'doctor').eq('is_approved', true).eq('is_active', true).neq('category', 'Consultant'), empty),
    safe(supabase.from('profiles').select('id, category, scheduled_inactive_date').in('category', ['Intern', 'Registrar']).eq('is_active', true), empty),
  ])

  const rosters = rostersRes.data || []

  // Locum placeholders, one count per published roster from this month on.
  const published = rosters.filter(r => r.status === 'published' && (r.year > year || r.month >= month))
  const locumCounts = await Promise.all(published.map(r =>
    safe(supabase.from('roster_entries').select('id', { count: 'exact', head: true }).eq('roster_month_id', r.id).eq('is_locum', true).is('profile_id', null).eq('locum_name', OPEN_LOCUM_LABEL), empty)
  ))
  const locumCountByRosterId = Object.fromEntries(published.map((r, i) => [r.id, locumCounts[i].count || 0]))

  // Published shifts from today whose doctor is on approved leave.
  let onLeaveShifts = []
  if (published.length > 0) {
    const [entriesRes, futureLeaveRes] = await Promise.all([
      safe(supabase.from('roster_entries').select('id, date, roster_month_id, profile_id')
        .in('roster_month_id', published.map(r => r.id)).gte('date', today)
        .not('profile_id', 'is', null).eq('is_locum', false), empty),
      safe(supabase.from('leave_requests').select('profile_id, date_from, date_to').eq('status', 'approved').gte('date_to', today), empty),
    ])
    onLeaveShifts = shiftsOnLeave(entriesRes.data, futureLeaveRes.data, today)
  }

  // Under-minimum only means something once this month has a roster.
  let underMinimum = 0
  if (rosters.some(r => r.year === year && r.month === month)) {
    try {
      const profiles = doctorsRes.data || []
      const [hoursByProfile, minimums] = await Promise.all([
        getMonthlyHoursByProfile(year, month),
        fetchMonthMinimums({ profiles, year, month }),
      ])
      underMinimum = countUnderMinimum({ profiles, hoursByProfile, minimums })
    } catch { /* leave it at 0 */ }
  }

  // Same rule as the Rotations tab's own badge (endOfRotationFlag).
  let rotationsEnding = 0
  const rotating = rotatingRes.data || []
  if (rotating.length > 0) {
    const rotRes = await safe(supabase.from('intern_rotations')
      .select('doctor_id, rotation_type, subtype, start_date, end_date').in('doctor_id', rotating.map(d => d.id)), empty)
    const byDoctor = new Map()
    for (const r of rotRes.data || []) {
      if (!byDoctor.has(r.doctor_id)) byDoctor.set(r.doctor_id, [])
      byDoctor.get(r.doctor_id).push(r)
    }
    rotationsEnding = rotating.filter(d => endOfRotationFlag({
      category: d.category, scheduledInactiveDate: d.scheduled_inactive_date, rotations: byDoctor.get(d.id) || [],
    }, today)).length
  }

  return buildAttentionItems({
    year, month, rosters, locumCountByRosterId,
    shiftsOnLeave: onLeaveShifts,
    plannedSaturdays: new Set((plannerRes.data || []).map(e => e.weekend_saturday)),
    pendingSignups: signupsRes.count || 0,
    accountRequests: requestsRes.count || 0,
    locumContacts: locumContactsRes.count || 0,
    neverSignedIn: neverRes.count || 0,
    rotationsEnding,
    underMinimum,
  })
}
