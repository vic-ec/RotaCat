import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { monthBounds, addDays } from '../../lib/dateRange'
import { computeWeekendPlannerDrift, weekendPlannerChangedSince } from '../../lib/weekendPlanner'
import { fetchApprovedLeaveByProfile } from '../../lib/approvedLeave'
import { outsidePlannerIds, isDriftMuted } from './rosterGridHelpers'

// The roster month's reads: the month, its entries, the doctors and
// consultants, shift types, public holidays, approved leave, the Weekend
// Planner drift (drafts) and open adverts — and the quiet re-reads after
// an edit. Moved out of RosterGridPage as they were.
export function useRosterMonthData({ id, isAdmin }) {
  const [rosterMonth, setRosterMonth] = useState(null)
  const [entries, setEntries] = useState([])    // all roster_entries for this month
  const [profiles, setProfiles] = useState([])   // all schedulable doctors
  const [consultantProfiles, setConsultantProfiles] = useState([]) // Consultant-category profiles, for the Consultant column dropdown
  const [shiftTypes, setShiftTypes] = useState({}) // keyed by id -> code
  const [shiftTypeRows, setShiftTypeRows] = useState({}) // keyed by id -> { code, start_time, end_time }
  const [leaveByProfile, setLeaveByProfile] = useState({}) // profile_id -> [[dateFrom, dateTo, leaveType|null, id|null], ...] approved leave
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publicHolidays, setPublicHolidays] = useState({}) // keyed by "YYYY-MM-DD" -> name

  // Draft-reopen check (§2.6): has the Weekend Planner changed since this
  // draft was generated? See computeWeekendPlannerDrift. Only computed for
  // a draft roster. dismissedDrift itself resets on every id change (never
  // persisted); "don't show again" is a separate opt-in (see
  // driftMutedInSession) that persists in sessionStorage keyed to the
  // drift's own content, so it self-invalidates the moment the planner
  // changes again rather than needing to be manually re-armed.
  const [plannerDrift, setPlannerDrift] = useState([])
  // Whether the planner was actually edited after this draft was generated
  // — decides which of two messages a drift gets (see the banner).
  const [plannerChangedSince, setPlannerChangedSince] = useState(false)
  const [dismissedDrift, setDismissedDrift] = useState(false)
  // Entry ids with an open advert this month, for the menu's Advertise /
  // Stop advertising.
  const [advertisedIds, setAdvertisedIds] = useState(new Set())

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is redefined every render; including it would refetch in a loop
  }, [id])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [rosterRes, entriesRes, profilesRes, consultantProfilesRes, shiftTypesRes, phRes] = await Promise.all([
        supabase.from('roster_months').select('*').eq('id', id).single(),
        supabase.from('roster_entries').select('*').eq('roster_month_id', id).order('date').order('position', { nullsFirst: true }),
        // Schedulable roster assignees (§1.2): all doctor categories except
        // Consultant (its own column below), excluding locums/clerks
        // (role != 'doctor'). No `is_active` filter here — a published
        // roster is a historical record, and a doctor deactivated after
        // being rostered must keep showing their real name on every past
        // month they were ever assigned to (HR audit-trail requirement).
        // `is_active` is still fetched so the *assignable* subset (who can
        // be newly rostered going forward) can be derived separately — see
        // assignableProfiles below.
        supabase.from('profiles').select('id, name, surname, category, color_code, pattern_type, contract_type, is_active')
          .eq('is_approved', true).eq('role', 'doctor').neq('category', 'Consultant'),
        // category is needed by the Lanes view's section header — without it
        // consultants grouped under a generic "Other".
        supabase.from('profiles').select('id, name, surname, category, color_code, pattern_type').eq('is_approved', true).eq('category', 'Consultant'),
        supabase.from('shift_types').select('id, code, start_time, end_time, duration_hours').eq('is_active', true),
        supabase.from('public_holidays').select('date, name'),
      ])

      if (rosterRes.error) throw new Error(rosterRes.error.message)
      setRosterMonth(rosterRes.data)
      // Normalise date strings — Supabase may return "2026-08-01T00:00:00"
      // or "2026-08-01" depending on column type. Slice to "YYYY-MM-DD" to
      // guarantee consistent keys throughout the component.
      const normalisedEntries = (entriesRes.data || []).map(e => ({
        ...e,
        date: e.date?.slice(0, 10),
      }))
      setEntries(normalisedEntries)
      setProfiles(profilesRes.data || [])
      setConsultantProfiles(consultantProfilesRes.data || [])

      const stMap = {}
      const stRows = {}
      for (const st of (shiftTypesRes.data || [])) { stMap[st.id] = st.code; stRows[st.id] = st }
      setShiftTypes(stMap)
      setShiftTypeRows(stRows)

      // Draft-reopen check (§2.6): only meaningful for a still-editable
      // draft — a published roster is the historical record, not
      // something to compare forward against the planner's current state.
      if (rosterRes.data.status === 'draft') {
        const { start, end } = monthBounds(rosterRes.data.year, rosterRes.data.month)
        // From the day before the 1st: a month that starts on a Sunday
        // shares that weekend with the month before, and the planner files
        // it under the Saturday.
        const { data: plannerData } = await supabase
          .from('weekend_planner_entries')
          .select('weekend_saturday, profile_id, created_at, updated_at')
          .gte('weekend_saturday', addDays(start, -1))
          .lte('weekend_saturday', end)
        const newDrift = computeWeekendPlannerDrift(normalisedEntries, plannerData || [], stMap, outsidePlannerIds(profilesRes.data, plannerData), { monthStart: start, monthEnd: end })
        setPlannerDrift(newDrift)
        setPlannerChangedSince(weekendPlannerChangedSince(normalisedEntries, plannerData || []))
        setDismissedDrift(isDriftMuted(id, newDrift))
      } else {
        setPlannerDrift([])
        setDismissedDrift(false)
      }

      // Build PH lookup keyed by "YYYY-MM-DD"
      const phMap = {}
      for (const ph of (phRes.data || [])) {
        phMap[ph.date?.slice(0, 10)] = ph.name
      }
      setPublicHolidays(phMap)

      // Approved leave overlapping this month (§1.2) — a doctor on leave
      // for a given date shouldn't appear in that date's assignment
      // dropdowns, and one who still holds a shift over it is struck
      // through on the grid. Fetched separately since it needs the month
      // bounds from rosterRes, which only resolves once the Promise.all
      // above lands.
      const { start: monthStart, end: monthEnd } = monthBounds(rosterRes.data.year, rosterRes.data.month)
      setLeaveByProfile(await fetchApprovedLeaveByProfile(monthStart, monthEnd))
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  // Re-fetches just this month's entries (and, for a draft, the planner
  // drift derived from them) after a single-cell edit — unlike loadAll,
  // this never toggles `loading`, so the grid stays mounted and the
  // update lands as a quiet re-render instead of a full-page reload.
  async function refreshEntries() {
    const { data } = await supabase
      .from('roster_entries')
      .select('*')
      .eq('roster_month_id', id)
      .order('date').order('position', { nullsFirst: true })
    const normalisedEntries = (data || []).map(e => ({ ...e, date: e.date?.slice(0, 10) }))
    setEntries(normalisedEntries)
    refreshAdverts(normalisedEntries)

    if (rosterMonth?.status === 'draft') {
      const { start, end } = monthBounds(rosterMonth.year, rosterMonth.month)
      const { data: plannerData } = await supabase
        .from('weekend_planner_entries')
        .select('weekend_saturday, profile_id, created_at, updated_at')
        .gte('weekend_saturday', addDays(start, -1))
        .lte('weekend_saturday', end)
      const newDrift = computeWeekendPlannerDrift(normalisedEntries, plannerData || [], shiftTypes, outsidePlannerIds(profiles, plannerData), { monthStart: start, monthEnd: end })
      setPlannerDrift(newDrift)
      setPlannerChangedSince(weekendPlannerChangedSince(normalisedEntries, plannerData || []))
      setDismissedDrift(isDriftMuted(id, newDrift))
    }
  }

  // Which of this month's rows carry an open advert. Admin-only use (the
  // menu); never throws.
  async function refreshAdverts(rows) {
    if (!isAdmin) return
    const ids = (rows || []).map(e => e.id)
    if (ids.length === 0) { setAdvertisedIds(new Set()); return }
    try {
      const { data } = await supabase.from('shift_advertisements').select('roster_entry_id').eq('status', 'open').in('roster_entry_id', ids)
      setAdvertisedIds(new Set((data || []).map(a => a.roster_entry_id)))
    } catch { /* leave as is */ }
  }
  useEffect(() => { if (!loading) refreshAdverts(entries) }, [loading, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps -- once the first load lands

  // Re-read after the vacancy dialog files or links leave, so the strike-
  // through and its popup are right without a full reload.
  async function refreshLeave() {
    if (!rosterMonth) return
    const { start, end } = monthBounds(rosterMonth.year, rosterMonth.month)
    setLeaveByProfile(await fetchApprovedLeaveByProfile(start, end))
  }

  return {
    rosterMonth, entries, profiles, consultantProfiles, shiftTypes, shiftTypeRows, leaveByProfile, loading, error,
    publicHolidays, plannerDrift, plannerChangedSince, dismissedDrift, setDismissedDrift, advertisedIds,
    loadAll, refreshEntries, refreshLeave,
  }
}
