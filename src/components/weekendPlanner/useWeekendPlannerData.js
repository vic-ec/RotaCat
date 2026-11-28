import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { groupForCategory, resolvedCategoryForDoctor } from '../../lib/weekendPlanner'
import { fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from '../../lib/internRotations'

// The Weekend Planner month view's reads: doctors, their rotations, the
// planner entries in the fetched window, this doctor's own weekend-off
// requests and (for a staffing viewer) everyone's. Re-runs whenever
// fetchBounds changes. Moved out of WeekendPlannerView as it was.
export function useWeekendPlannerData({ fetchBounds, profile, staffingRole }) {
  const [doctors, setDoctors] = useState([])
  const [rotationsByDoctorId, setRotationsByDoctorId] = useState(new Map())
  const [entries, setEntries] = useState([])
  const [myWeekendRequests, setMyWeekendRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weekendExceptions, setWeekendExceptions] = useState([])

  useEffect(() => { load() }, [fetchBounds]) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; fetchBounds is the only input that should trigger a refetch

  async function load() {
    setLoading(true)
    setError('')

    const [profilesRes, entriesRes, myRequestsRes, allExceptionsRes] = await Promise.all([
      // No `is_active` filter: a doctor deactivated after being rostered
      // must keep showing their real name on every past weekend they were
      // ever assigned to (HR audit-trail requirement) — filtering the
      // profiles fetch to active-only left deactivated doctors out of
      // doctorById/displayNames entirely, rendering their historical
      // entries as "(unknown)". `is_active` is still fetched below so the
      // *assignable* subset (who can be newly rostered going forward) can
      // be derived separately — see assignableDoctors.
      supabase.from('profiles').select('id, name, surname, category, contract_type, is_active, color_code')
        .eq('is_approved', true),
      supabase.from('weekend_planner_entries').select('id, weekend_saturday, profile_id, category')
        .gte('weekend_saturday', fetchBounds.from).lte('weekend_saturday', fetchBounds.through),
      supabase.from('leave_requests').select('id, date_from, status')
        .eq('profile_id', profile?.id ?? '').eq('leave_type', 'weekend_exception')
        .gte('date_from', fetchBounds.from).lte('date_from', fetchBounds.through),
      // Everyone's exceptions, approved and pending, for the month view's
      // own exceptions panel — an admin planning a month has to see the
      // requests that reshape it, not just their own. A doctor gets an
      // empty list here and keeps only the personal myRequests fetch above,
      // which drives their own per-card status label.
      staffingRole
        ? supabase.from('leave_requests')
          .select('id, profile_id, date_from, status, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type)')
          .eq('leave_type', 'weekend_exception').in('status', ['approved', 'pending'])
          .gte('date_from', fetchBounds.from).lte('date_from', fetchBounds.through)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (entriesRes.error) { setError(entriesRes.error.message); setLoading(false); return }
    if (myRequestsRes.error) { setError(myRequestsRes.error.message); setLoading(false); return }
    if (allExceptionsRes.error) { setError(allExceptionsRes.error.message); setLoading(false); return }

    const rotationEligibleDoctors = (profilesRes.data || []).filter(p => groupForCategory(resolvedCategoryForDoctor(p)))
    setDoctors(rotationEligibleDoctors)
    setEntries(entriesRes.data || [])
    setMyWeekendRequests(myRequestsRes.data || [])
    setWeekendExceptions(allExceptionsRes.data || [])
    setLoading(false)

    // Batch-fetched ONCE for every rotation-eligible, currently-assignable
    // doctor here, then resolved client-side per weekend via
    // resolveWeekendCategoryForDoctor — not one RPC call per doctor per
    // picker open (see that function's own comment in weekendPlanner.js).
    // Scoped to assignable (active) doctors only: rotations only ever feed
    // the add-doctor picker/new-assignment category resolution, never
    // historical entries (those already carry their own persisted
    // category), so there's no need to fetch rotation data for doctors who
    // can't be newly assigned anyway. Awaited separately from the main load
    // above so a slow/failed rotations fetch never blocks the planner grid
    // itself from rendering; a resolver call with no matching rows just
    // falls back to the doctor's plain base category (resolved:false).
    try {
      const assignableIds = rotationEligibleDoctors.filter(d => d.is_active).map(d => d.id)
      const rotations = await fetchInternRotationsForDoctorIds(assignableIds)
      setRotationsByDoctorId(groupRotationsByDoctorId(rotations))
    } catch {
      setRotationsByDoctorId(new Map())
    }
  }

  return { doctors, rotationsByDoctorId, entries, setEntries, myWeekendRequests, weekendExceptions, loading, error, setError, load }
}
