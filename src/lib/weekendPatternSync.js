// Keeps weekend_patterns in sync with what actually got published. The
// scheduler backend still reads last_worked_weekend/next_weekend_type off
// this table for shift-type (days/nights) continuity, and weekend_offset
// parity for ⅝-contract doctors who sit outside the Weekend Planner's
// rotation groups — see loader.py. Called from RosterGridPage's
// handlePublish with that roster's already-loaded entries + shift type
// code map.
import { supabase } from './supabase'
import { addDays, dayOfWeek } from './dateRange'

const WEEKEND_CODES = { WE_08: 'days', WE_13: 'days', WE_20: 'nights' }

// Pure: for each profile, the latest (Saturday, type) among this batch of
// entries. WE_* shifts only ever land on a Saturday or Sunday, so a Sunday
// entry is folded back to its Saturday to key by weekend.
export function computeLatestWeekendByProfile(entries, shiftTypeCodes) {
  const latest = new Map()
  for (const e of entries) {
    if (!e.profile_id) continue
    const type = WEEKEND_CODES[shiftTypeCodes[e.shift_type_id]]
    if (!type) continue
    const saturday = dayOfWeek(e.date) === 0 ? addDays(e.date, -1) : e.date
    const prev = latest.get(e.profile_id)
    if (!prev || saturday > prev.saturday) latest.set(e.profile_id, { saturday, type })
  }
  return latest
}

// Upserts weekend_patterns from a published roster's entries. Never regresses
// an already-tracked profile to an earlier Saturday than what's stored — lets
// rosters be published out of chronological order without corrupting state.
export async function syncWeekendPatternsFromEntries(entries, shiftTypeCodes) {
  const latest = computeLatestWeekendByProfile(entries, shiftTypeCodes)
  if (latest.size === 0) return

  const profileIds = [...latest.keys()]
  const { data: existing } = await supabase
    .from('weekend_patterns')
    .select('profile_id, last_worked_weekend')
    .in('profile_id', profileIds)
  const existingByProfile = new Map((existing || []).map(r => [r.profile_id, r.last_worked_weekend]))

  const upserts = []
  for (const [profileId, { saturday, type }] of latest) {
    const prevDate = existingByProfile.get(profileId)
    if (prevDate && prevDate >= saturday) continue
    upserts.push({
      profile_id: profileId,
      last_worked_weekend: saturday,
      last_weekend_type: type,
      next_weekend_type: type === 'days' ? 'nights' : 'days',
      updated_at: new Date().toISOString(),
    })
  }
  if (upserts.length === 0) return
  await supabase.from('weekend_patterns').upsert(upserts, { onConflict: 'profile_id' })
}
