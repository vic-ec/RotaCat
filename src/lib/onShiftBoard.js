// The admin Dashboard's "On shift" panel: who is working now, grouped by
// shift (shifts overlap, so there can be several groups, each with its own
// end time), and who starts next. Published (and archived) rosters only.
// The grouping is pure; fetchOnShiftBoard does the reads.
import { supabase } from './supabase'
import { addDays, formatLocalDate } from './dateRange'
import { applyTimeOverrides } from './shiftTimes'
import { isOpenLocumSlot, locumDisplayName } from './locumCover'
import { fetchLateArrivalsInRange } from './lateArrivals'

function windowOf(date, startTime, endTime) {
  const start = new Date(`${date}T${startTime}`)
  let end = new Date(`${date}T${endTime}`)
  if (endTime <= startTime) end = new Date(end.getTime() + 86400000)
  return { start, end }
}

const fullName = p => `${p?.name || ''} ${p?.surname || ''}`.trim()

export function initialsOf(name) {
  const words = String(name || '').replace(/[[\]]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

// One person (or an open slot) on a shift, in the shape the badge draws.
// null for a row that holds nobody and is not an open slot (a doctor taken
// off with no cover wanted, or the consultant's own row).
export function boardPerson(row, { late = false, vacatedName = null } = {}) {
  if (isOpenLocumSlot(row)) {
    return { key: row.id, kind: 'open', initials: '[ ]', label: 'Open locum slot · not covered', sortName: '', late: false }
  }
  if (row.is_locum) {
    const name = row.profile ? fullName(row.profile) : locumDisplayName(row.locum_name)
    return {
      key: row.id, kind: 'locum', initials: initialsOf(name), sortName: row.profile?.surname || name, late,
      label: `${name || 'Locum'} · Locum${vacatedName ? ` · covering ${vacatedName}` : ''}`,
    }
  }
  if (!row.profile_id) return null
  const name = fullName(row.profile)
  const category = String(row.profile?.category || '').replace(/_/g, ' ')
  return {
    key: row.id, kind: 'doctor', profile: row.profile, initials: initialsOf(name), sortName: row.profile?.surname || name, late,
    label: `${name}${category ? ` · ${category}` : ''}${vacatedName ? ` · covering ${vacatedName}` : ''}`,
  }
}

// rows   roster_entries joined with shift_type, profile and the vacated
//        doctor's name, adjusted times already applied
// now    a Date
// Returns { now: [group], next: [group], consultant }, each group
// { key, start, end, startTime, endTime, night, people }. `next` is every
// shift starting at the first start time after `now` (within 24 hours).
export function buildOnShiftBoard(rows, now, { lateEntryIds = new Set() } = {}) {
  const groups = new Map()
  let consultant = null
  const today = formatLocalDate(now)
  for (const row of rows || []) {
    if (row.consultant_profile_id && row.date === today && row.consultant) consultant = fullName(row.consultant)
    const st = row.shift_type
    if (!st) continue
    const person = boardPerson(row, { late: lateEntryIds.has(row.id), vacatedName: row.vacated ? fullName(row.vacated) : null })
    if (!person) continue
    const key = `${row.date}|${st.start_time}|${st.end_time}`
    if (!groups.has(key)) {
      const { start, end } = windowOf(row.date, st.start_time, st.end_time)
      groups.set(key, { key, start, end, startTime: st.start_time, endTime: st.end_time, night: Boolean(st.is_night_shift), people: [] })
    }
    groups.get(key).people.push(person)
  }
  // Doctors first, then locums, then open slots; by surname within each.
  const rank = { doctor: 0, locum: 1, open: 2 }
  for (const g of groups.values()) g.people.sort((a, b) => rank[a.kind] - rank[b.kind] || a.sortName.localeCompare(b.sortName))

  const all = [...groups.values()].sort((a, b) => a.start - b.start || a.end - b.end)
  const onNow = all.filter(g => now >= g.start && now < g.end)
  const ahead = all.filter(g => g.start > now && g.start - now <= 24 * 3600000)
  const firstStart = ahead[0]?.start?.getTime()
  const next = firstStart == null ? [] : ahead.filter(g => g.start.getTime() === firstStart)
  return { now: onNow, next, consultant }
}

// "in 30 min" / "in 2 h" / "tomorrow"
export function startsInLabel(start, now) {
  const minutes = Math.round((start - now) / 60000)
  if (formatLocalDate(start) !== formatLocalDate(now)) return 'tomorrow'
  if (minutes < 60) return `in ${minutes} min`
  return `in ${Math.round(minutes / 60)} h`
}

const PERSON = 'name, surname, category, color_code, avatar_url, pattern_type'
const COLUMNS = 'id, date, profile_id, is_locum, locum_name, locum_contact_id, vacated_profile_id, consultant_profile_id, '
  + 'start_time_override, end_time_override, roster_months!inner(status, deleted_at), '
  + 'shift_type:shift_types(code, start_time, end_time, is_night_shift), '
  + `profile:profiles!roster_entries_profile_id_fkey(${PERSON}), `
  + 'vacated:profiles!roster_entries_vacated_profile_id_fkey(name, surname), '
  + 'consultant:profiles!roster_entries_consultant_profile_id_fkey(name, surname)'

export async function fetchOnShiftBoard(now = new Date()) {
  const today = formatLocalDate(now)
  const from = addDays(today, -1)
  const to = addDays(today, 1)
  const [entriesRes, late] = await Promise.all([
    supabase.from('roster_entries').select(COLUMNS)
      .gte('date', from).lte('date', to)
      .in('roster_months.status', ['published', 'archived']),
    fetchLateArrivalsInRange(from, to).catch(() => []),
  ])
  if (entriesRes.error) throw new Error(entriesRes.error.message)
  const rows = applyTimeOverrides((entriesRes.data || []).filter(r => !r.roster_months?.deleted_at))
  return buildOnShiftBoard(rows, now, { lateEntryIds: new Set(late.map(l => l.roster_entry_id).filter(Boolean)) })
}
