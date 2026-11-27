// Reads for the "My year" page and the days-in-lieu balance. Everything
// comes from existing tables; the figures themselves are worked out in
// myYear.js.
import { supabase } from './supabase'
import { addDays } from './dateRange'
import { MY_YEAR_SETTING_KEYS, readMyYearSettings, lieuBalancesByProfile } from './myYear'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isProfileId = value => UUID.test(String(value || ''))

// Rosters whose shifts count as worked.
const COUNTED_STATUSES = ['published', 'archived']

const ENTRY_COLUMNS = 'id, roster_month_id, date, profile_id, is_locum, locum_name, locum_contact_id, counts_toward_contract_hours, '
  + 'vacated_profile_id, vacated_reason, vacated_leave_request_id, consultant_profile_id, start_time_override, '
  + 'shift_types(code, label, day_type, is_night_shift, start_time)'

// Never throws: with the rows missing (offline, or ahead of the migration)
// the migration's defaults stand.
export async function fetchMyYearSettings() {
  try {
    const { data } = await supabase.from('app_settings').select('key, value').in('key', MY_YEAR_SETTING_KEYS)
    return readMyYearSettings(data)
  } catch {
    return readMyYearSettings([])
  }
}

function holidayMap(rows) {
  return new Map((rows || []).map(h => [String(h.date).slice(0, 10), h.name]))
}

// One person's whole record: every leave request, every roster row they
// hold, came off or are the consultant on (published and archived rosters
// only), the public holidays, and the names those rows point at.
export async function fetchMyYear(profileId) {
  if (!isProfileId(profileId)) throw new Error('Unknown person.')

  const [profileRes, leaveRes, monthsRes, holidaysRes, settings] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    supabase.from('leave_requests').select('*').eq('profile_id', profileId).order('date_from', { ascending: true }),
    supabase.from('roster_months').select('id, year, month, status').is('deleted_at', null),
    supabase.from('public_holidays').select('date, name'),
    fetchMyYearSettings(),
  ])
  for (const res of [profileRes, leaveRes, monthsRes, holidaysRes]) {
    if (res.error) throw new Error(res.error.message)
  }

  const months = monthsRes.data || []
  const counted = months.filter(m => COUNTED_STATUSES.includes(m.status))
  let entries = []
  if (counted.length > 0) {
    const res = await supabase.from('roster_entries')
      .select(ENTRY_COLUMNS)
      .in('roster_month_id', counted.map(m => m.id))
      .or(`profile_id.eq.${profileId},vacated_profile_id.eq.${profileId},consultant_profile_id.eq.${profileId}`)
      .order('date', { ascending: true })
    if (res.error) throw new Error(res.error.message)
    entries = res.data || []
  }

  const requests = leaveRes.data || []
  const nameIds = new Set()
  for (const e of entries) if (e.profile_id && e.profile_id !== profileId) nameIds.add(e.profile_id)
  for (const r of requests) if (r.submitted_by && r.submitted_by !== profileId) nameIds.add(r.submitted_by)
  const names = {}
  if (nameIds.size > 0) {
    const res = await supabase.from('profiles').select('id, name, surname').in('id', [...nameIds])
    for (const p of res.data || []) names[p.id] = `${p.name || ''} ${p.surname || ''}`.trim()
  }

  const pad = n => String(n).padStart(2, '0')
  return {
    profile: profileRes.data,
    requests,
    entries,
    holidays: holidayMap(holidaysRes.data),
    settings,
    names,
    // 'YYYY-MM' -> roster month id, for links to the roster. Every month
    // this viewer can open; `publishedMonths` is the subset that counts.
    monthIds: Object.fromEntries(months.map(m => [`${m.year}-${pad(m.month)}`, m.id])),
    publishedMonths: new Set(counted.map(m => `${m.year}-${pad(m.month)}`)),
  }
}

// { [profileId]: { earned, taken, owed } } for everyone, across all time —
// what Hours Summary shows. Never throws; {} when it cannot be read.
export async function fetchLieuBalances() {
  try {
    const [monthsRes, holidaysRes, settings] = await Promise.all([
      supabase.from('roster_months').select('id, status').is('deleted_at', null).in('status', COUNTED_STATUSES),
      supabase.from('public_holidays').select('date, name'),
      fetchMyYearSettings(),
    ])
    const holidays = holidayMap(holidaysRes.data)
    const monthIds = (monthsRes.data || []).map(m => m.id)
    const dates = new Set(holidays.keys())
    if (settings.lieuCountNightBefore) for (const d of holidays.keys()) dates.add(addDays(d, -1))

    const [entriesRes, leaveRes] = await Promise.all([
      monthIds.length > 0 && dates.size > 0
        ? supabase.from('roster_entries')
            .select('id, roster_month_id, date, profile_id, is_locum, shift_types(code, is_night_shift)')
            .in('roster_month_id', monthIds).in('date', [...dates]).not('profile_id', 'is', null)
        : { data: [] },
      supabase.from('leave_requests').select('profile_id, leave_type, date_from, date_to, status').eq('status', 'approved'),
    ])
    return lieuBalancesByProfile(entriesRes.data || [], holidays, leaveRes.data || [], { countNightBefore: settings.lieuCountNightBefore })
  } catch {
    return {}
  }
}

// The roster page for a date, or null when this viewer has no roster for
// that month. `doctor` lights up that person's shift on arrival.
export function rosterLinkForDate(monthIds, date, { doctor, entry, mark = false } = {}) {
  const id = monthIds?.[String(date).slice(0, 7)]
  if (!id) return null
  const params = new URLSearchParams({ date })
  if (entry) params.set('entry', entry)
  else if (doctor) params.set('doctor', doctor)
  if (mark) params.set('mark', '1')
  return `/roster/${id}?${params}`
}
