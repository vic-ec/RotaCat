// Live query layer for the Roster Summary tab — computed on demand from
// source tables (roster_entries/shift_types/leave_requests/ph_lieu_ledger),
// never from the unpopulated monthly_stats table. See Section 12 of
// vhw_scheduling_rules_v2.md for the physical sheet this replicates.
import { supabase } from './supabase'
import { monthBounds, datesInRange } from './dateRange'

// PH_* is the 3-slot weekend-style code set; PHW_* is the separate 4-slot
// set for a PH falling on a weekday (see CLAUDE.md's roster domain model) —
// both are broken out into their own shiftsByCode keys.
export const SUMMARY_SHIFT_CODES = [
  'WD_08', 'WD_12', 'WD_15', 'WD_22',
  'WE_08', 'WE_13', 'WE_20',
  'PHW_08', 'PHW_12', 'PHW_15', 'PHW_22',
  'PH_08', 'PH_13', 'PH_20',
]

function emptyRow(profile) {
  return {
    profileId: profile.id,
    name: profile.name,
    surname: profile.surname,
    category: profile.category,
    contractType: profile.contract_type,
    minHours: profile.min_hours,
    maxHours: profile.max_hours,
    colorCode: profile.color_code,
    totalHours: 0,
    locumHours: 0,
    shiftsByCode: Object.fromEntries(SUMMARY_SHIFT_CODES.map(c => [c, 0])),
    totalWeekdayNights: 0,
    totalWeekendNights: 0,
    totalNights: 0,
    totalPH: 0,
    leaveDays: 0,
    leaveByType: {},
    phLieuOwed: 0,
    phLieuTaken: 0,
  }
}

// Single per-doctor summary row for a given month, computed live from
// source tables (no caching, no scheduled recompute — see RosterSummaryPage
// for the refetch cadence). Excludes role='locum' profiles entirely; a
// locum-tagged shift covering a normally-contracted doctor (the Bottomley/
// Baerends case, roster_entries.counts_toward_contract_hours=false on a row
// that still has a real profile_id) lands as locumHours on THEIR row
// instead of a separate locum row.
export async function fetchRosterSummary({ month, year }) {
  const { start: monthStart, end: monthEnd } = monthBounds(year, month)

  const [profilesRes, rosterMonthsRes, leaveRes, ledgerRes] = await Promise.all([
    supabase.from('profiles')
      .select('id, name, surname, category, contract_type, min_hours, max_hours, color_code')
      .eq('role', 'doctor').eq('is_approved', true).eq('is_active', true)
      .order('surname'),
    supabase.from('roster_months').select('id').eq('year', year).eq('month', month).is('deleted_at', null),
    supabase.from('leave_requests')
      .select('profile_id, leave_type, date_from, date_to')
      .eq('status', 'approved')
      .lte('date_from', monthEnd).gte('date_to', monthStart),
    supabase.from('ph_lieu_ledger').select('profile_id, days_owed, taken'),
  ])

  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (rosterMonthsRes.error) throw new Error(rosterMonthsRes.error.message)
  if (leaveRes.error) throw new Error(leaveRes.error.message)
  if (ledgerRes.error) throw new Error(ledgerRes.error.message)

  const rosterMonthIds = (rosterMonthsRes.data || []).map(r => r.id)
  const entriesRes = rosterMonthIds.length > 0
    ? await supabase.from('roster_entries')
        .select('profile_id, is_locum, counts_toward_contract_hours, extra_hours, shift_types(code, duration_hours, day_type, is_night_shift, counts_as_we_night)')
        .in('roster_month_id', rosterMonthIds)
        .not('profile_id', 'is', null)
    : { data: [], error: null }
  if (entriesRes.error) throw new Error(entriesRes.error.message)

  const rows = (profilesRes.data || []).map(emptyRow)
  const rowByProfileId = Object.fromEntries(rows.map(r => [r.profileId, r]))

  for (const entry of entriesRes.data || []) {
    const row = rowByProfileId[entry.profile_id]
    const st = entry.shift_types
    if (!row || !st) continue
    const hours = Number(st.duration_hours || 0) + Number(entry.extra_hours || 0)

    if (!entry.counts_toward_contract_hours) {
      row.locumHours += hours
      continue
    }
    row.totalHours += hours
    if (st.code in row.shiftsByCode) row.shiftsByCode[st.code]++
    if (st.is_night_shift) {
      row.totalNights++
      if (st.counts_as_we_night) row.totalWeekendNights++
      else row.totalWeekdayNights++
    }
    if (st.day_type === 'PH' || st.day_type === 'PH_weekday') row.totalPH++
  }

  for (const lr of leaveRes.data || []) {
    const row = rowByProfileId[lr.profile_id]
    if (!row) continue
    const from = lr.date_from < monthStart ? monthStart : lr.date_from
    const to = lr.date_to > monthEnd ? monthEnd : lr.date_to
    if (from > to) continue
    const days = datesInRange(from, to).length
    row.leaveDays += days
    row.leaveByType[lr.leave_type] = (row.leaveByType[lr.leave_type] || 0) + days
  }

  // Cumulative, not month-scoped — a running PH-in-lieu balance owed/taken
  // across every PH shift this doctor has ever worked, per ph_lieu_ledger's
  // own doc comment ("HR reference only — not enforced by scheduler").
  for (const ledgerRow of ledgerRes.data || []) {
    const row = rowByProfileId[ledgerRow.profile_id]
    if (!row) continue
    row.phLieuOwed += ledgerRow.days_owed || 0
    if (ledgerRow.taken) row.phLieuTaken += ledgerRow.days_owed || 0
  }

  return rows
}
