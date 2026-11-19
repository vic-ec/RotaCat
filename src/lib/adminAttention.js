// The admin dashboard's "Needs attention" rows beyond pending leave and
// hours-over-ceiling: things only an admin can act on, each with somewhere
// to go and do it. A row exists only while its count is above zero.
//
// `buildAttentionItems` is pure (and tested); `fetchAdminAttention` is the
// thin Supabase read around it. Every query is best-effort — a failed read
// drops that row rather than the whole panel.

import { supabase } from './supabase'
import { monthBounds, todayStr } from './dateRange'
import { saturdaysInMonth } from './weekendPlanner'
import { endOfRotationFlag } from './internRotations'
import { getMonthlyHoursByProfile } from './monthlyHours'

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
export function buildAttentionItems(data) {
  const { year, month } = data
  const next = nextMonthOf(year, month)
  const items = []
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
      key: 'signups', count: data.pendingSignups, to: '/staff?tab=pending',
      label: `${plural(data.pendingSignups, 'sign-up', 'sign-ups')} awaiting approval`,
    })
  }
  if (data.accountRequests > 0) {
    items.push({
      key: 'account-requests', count: data.accountRequests, to: '/staff?tab=requests',
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

// Doctors under their contracted minimum for a month that HAS a roster.
// Anyone with approved leave in the month is left out: the engine scales
// their minimum down for the days they're away, and this page can't
// reproduce that exactly — better no row than a false one.
export function countUnderMinimum({ profiles, hoursByProfile, onLeaveIds }) {
  return profiles.filter(p => {
    const min = Number(p.min_hours)
    if (!min || onLeaveIds.has(p.id)) return false
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
  const { start: monthStart, end: monthEnd } = monthBounds(year, month)
  const nextSaturdays = saturdaysInMonth(next.year, next.month)
  const empty = { data: [], count: 0 }

  const [rostersRes, plannerRes, signupsRes, requestsRes, neverRes, doctorsRes, leaveRes, rotatingRes] = await Promise.all([
    safe(supabase.from('roster_months').select('id, year, month, status').is('deleted_at', null).gte('year', year), empty),
    nextSaturdays.length > 0
      ? safe(supabase.from('weekend_planner_entries').select('weekend_saturday')
          .gte('weekend_saturday', nextSaturdays[0]).lte('weekend_saturday', nextSaturdays[nextSaturdays.length - 1]), empty)
      : empty,
    safe(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', false).eq('is_rejected', false), empty),
    safe(supabase.from('account_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'), empty),
    safe(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_approved', true).eq('must_change_password', true), empty),
    safe(supabase.from('profiles').select('id, min_hours').eq('role', 'doctor').eq('is_approved', true).eq('is_active', true).neq('category', 'Consultant'), empty),
    safe(supabase.from('leave_requests').select('profile_id').eq('status', 'approved').lte('date_from', monthEnd).gte('date_to', monthStart), empty),
    safe(supabase.from('profiles').select('id, category, scheduled_inactive_date').in('category', ['Intern', 'Registrar']).eq('is_active', true), empty),
  ])

  const rosters = rostersRes.data || []

  // Locum placeholders, one count per published roster from this month on.
  const published = rosters.filter(r => r.status === 'published' && (r.year > year || r.month >= month))
  const locumCounts = await Promise.all(published.map(r =>
    safe(supabase.from('roster_entries').select('id', { count: 'exact', head: true }).eq('roster_month_id', r.id).eq('is_locum', true), empty)
  ))
  const locumCountByRosterId = Object.fromEntries(published.map((r, i) => [r.id, locumCounts[i].count || 0]))

  // Under-minimum only means something once this month has a roster.
  let underMinimum = 0
  if (rosters.some(r => r.year === year && r.month === month)) {
    try {
      const hoursByProfile = await getMonthlyHoursByProfile(year, month)
      underMinimum = countUnderMinimum({
        profiles: doctorsRes.data || [],
        hoursByProfile,
        onLeaveIds: new Set((leaveRes.data || []).map(l => l.profile_id)),
      })
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
    plannedSaturdays: new Set((plannerRes.data || []).map(e => e.weekend_saturday)),
    pendingSignups: signupsRes.count || 0,
    accountRequests: requestsRes.count || 0,
    neverSignedIn: neverRes.count || 0,
    rotationsEnding,
    underMinimum,
  })
}
