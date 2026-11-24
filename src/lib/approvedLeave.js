// Who is on approved leave in a date range, for the roster.
//
// Two reads, merged:
//   approved_leave_ranges (RPC)  who and when, for EVERY doctor, with no
//                                type. The roster strikes through a doctor
//                                who is on leave for a shift they still
//                                hold, and that must read the same for every
//                                viewer (see the migration that adds it).
//   leave_requests (plain select) the type, only for the rows this viewer's
//                                own RLS lets them see.
//
// Shape: { [profileId]: [[dateFrom, dateTo, leaveType | null, id | null]] }.
// The first two slots are what isOnApprovedLeave has always read, so that
// helper needs no change. Never throws: with the RPC unavailable (offline,
// or a cached shell ahead of the migration) it falls back to the visible
// rows alone, which is what the roster read before.
import { supabase } from './supabase'

export async function fetchApprovedLeaveByProfile(dateFrom, dateTo) {
  let ranges = null
  let visible = []
  try {
    const [rpcRes, rowsRes] = await Promise.all([
      Promise.resolve(supabase.rpc('approved_leave_ranges', { p_from: dateFrom, p_to: dateTo })).catch(() => ({ data: null, error: true })),
      supabase.from('leave_requests')
        .select('id, profile_id, date_from, date_to, leave_type, submitted_by, reviewed_by')
        .eq('status', 'approved')
        .lte('date_from', dateTo)
        .gte('date_to', dateFrom),
    ])
    if (!rpcRes?.error && Array.isArray(rpcRes?.data)) ranges = rpcRes.data
    visible = rowsRes?.data || []
  } catch {
    return {}
  }
  return mergeLeaveRanges(ranges, visible)
}

// Pure. `ranges` null means the RPC gave nothing usable.
export function mergeLeaveRanges(ranges, visibleRows) {
  const day = v => v?.slice(0, 10)
  const visibleByKey = new Map()
  for (const r of visibleRows || []) visibleByKey.set(`${r.profile_id}|${day(r.date_from)}|${day(r.date_to)}`, r)
  const source = ranges ?? visibleRows ?? []
  const byProfile = {}
  for (const r of source) {
    const from = day(r.date_from)
    const to = day(r.date_to)
    const match = visibleByKey.get(`${r.profile_id}|${from}|${to}`)
    const list = byProfile[r.profile_id] || (byProfile[r.profile_id] = [])
    // Slot 4: who put it on record — the admin who captured it, else the
    // one who approved it. Null where this viewer cannot see the row.
    list.push([from, to, match?.leave_type ?? null, match?.id ?? null, match ? (match.submitted_by || match.reviewed_by || null) : null])
  }
  return byProfile
}

// The approved-leave range covering `date` for a profile, or null.
export function leaveRangeOn(leaveByProfile, profileId, date) {
  if (!profileId || !date) return null
  return (leaveByProfile?.[profileId] || []).find(([from, to]) => date >= from && date <= to) || null
}
