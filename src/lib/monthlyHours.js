// Dashboard's live hours-warning — flags doctors already at/over their
// monthly hour ceiling, reading the ceiling live from the constraints table
// (v2.1 numbers) rather than hardcoding any figure here.
import { supabase } from './supabase'
import { monthBounds } from './dateRange'

// CONTRACT_CEILING_KEYS is keyed by the *current* contract_type enum value
// (what doc.contract_type actually equals), mapped to the constraints-table
// row that holds its ceiling. The constraints table key itself is still
// named 'max_hours_psych_overtime' (deliberately not renamed — see the
// 2026-08 migration notes; nothing backend-side reads it by name, but
// several frontend places still do, so it stayed put for now). Only the
// left-hand lookup key changed, to match contract_type's real value after
// psych_overtime was renamed to Junior_Doctor_Overtime.
const CONTRACT_CEILING_KEYS = {
  full: 'max_hours_full_time',
  five_eighths: 'max_hours_five_eighths',
  Junior_Doctor_Overtime: 'max_hours_psych_overtime',
}

export async function getContractHourCeilings() {
  const { data } = await supabase
    .from('constraints')
    .select('key, value')
    .in('key', Object.values(CONTRACT_CEILING_KEYS))
  const byKey = Object.fromEntries((data || []).map(r => [r.key, Number(r.value)]))
  return {
    full: byKey[CONTRACT_CEILING_KEYS.full],
    five_eighths: byKey[CONTRACT_CEILING_KEYS.five_eighths],
    Junior_Doctor_Overtime: byKey[CONTRACT_CEILING_KEYS.Junior_Doctor_Overtime],
  }
}

export async function getMonthlyHoursByProfile(year, month) {
  const { start, end } = monthBounds(year, month)
  const { data } = await supabase
    .from('roster_entries')
    .select('profile_id, counts_toward_contract_hours, extra_hours, shift_types(duration_hours)')
    .gte('date', start)
    .lte('date', end)
    .not('profile_id', 'is', null)

  const hoursByProfile = new Map()
  for (const entry of data || []) {
    if (!entry.counts_toward_contract_hours) continue
    const prev = hoursByProfile.get(entry.profile_id) || 0
    const entryHours = Number(entry.shift_types?.duration_hours || 0) + Number(entry.extra_hours || 0)
    hoursByProfile.set(entry.profile_id, prev + entryHours)
  }
  return hoursByProfile
}

// Pure: which profiles are already at/over their contract-type's ceiling.
// Profiles with an unrecognised/missing contract_type ceiling are skipped,
// not errored.
export function findHoursWarnings({ profiles, hoursByProfile, ceilings }) {
  const warnings = []
  for (const p of profiles) {
    const ceiling = ceilings[p.contract_type]
    if (ceiling === undefined || ceiling === null || Number.isNaN(ceiling)) continue
    const hours = hoursByProfile.get(p.id) || 0
    if (hours >= ceiling) warnings.push({ profileId: p.id, name: p.name, surname: p.surname, hours, ceiling, contractType: p.contract_type })
  }
  return warnings
}

export async function getDashboardHoursWarnings(profiles, { year, month }) {
  const [ceilings, hoursByProfile] = await Promise.all([
    getContractHourCeilings(),
    getMonthlyHoursByProfile(year, month),
  ])
  return findHoursWarnings({ profiles, hoursByProfile, ceilings })
}
