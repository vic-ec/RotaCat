// Late arrivals: logged by an admin against a rostered shift, one record
// per roster entry. The record copies the date, shift and shift start so it
// survives later roster edits. Admins read and write the table; a doctor
// reads only their own records through get_my_late_arrivals(), which never
// returns who logged them (see the migration).
import { supabase } from './supabase'
import { locumDisplayName } from './locumCover'
import { shiftStartLabel } from './myYear'

export const MAX_MINUTES_LATE = 720

const toMinutes = time => {
  const [h, m] = String(time || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}
const hhmm = time => String(time || '').slice(0, 5)

// Minutes between the shift start and the arrival. An arrival time at or
// before the start is read as the next day (a 22h00 shift, arrived 00h30),
// which is why anything over 12 hours is refused rather than believed.
// null when either time is missing.
export function minutesLate(shiftStart, arrivedAt) {
  const start = toMinutes(shiftStart)
  const arrived = toMinutes(arrivedAt)
  if (start == null || arrived == null) return null
  return arrived > start ? arrived - start : arrived - start + 1440
}

// "25 min" / "1 h 05 min"
export function lateByLabel(minutes) {
  if (minutes == null) return ''
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

// Has this shift started? `now` is a Date.
export function shiftHasStarted(date, shiftStart, now = new Date()) {
  const [y, m, d] = String(date).split('-').map(Number)
  const start = toMinutes(shiftStart) ?? 0
  return now >= new Date(y, m - 1, d, Math.floor(start / 60), start % 60)
}

// null when the record can be saved, else the reason it cannot.
export function validateLateArrival({ option, arrivedAt, now = new Date() }) {
  if (!option) return 'Choose who arrived late.'
  if (!shiftHasStarted(option.date, option.shiftStart, now)) return 'This shift has not started yet.'
  const minutes = minutesLate(option.shiftStart, arrivedAt)
  if (minutes == null) return 'Enter the time they arrived.'
  if (minutes > MAX_MINUTES_LATE) return 'The arrival time must be after the shift start, and no more than 12 hours late.'
  return null
}

// A rostered shift someone can be late for, in the one shape the form
// works with. Open slots and struck-through (vacated, uncovered) rows hold
// nobody, so they give null.
//   entry      roster_entries row
//   shiftType  { code, start_time }
//   person     the profile on it, if any: { name, surname, category, role }
export function shiftOption(entry, shiftType, person) {
  if (!entry || !shiftType) return null
  const locumName = entry.is_locum ? locumDisplayName(entry.locum_name) : ''
  if (!entry.profile_id && !locumName) return null
  const isLocum = Boolean(entry.is_locum) || person?.role === 'locum'
  const shiftStart = entry.start_time_override || shiftType.start_time
  const name = person ? `${person.name || ''} ${person.surname || ''}`.trim() : locumName
  const who = isLocum
    ? `[ ${name || locumName || 'Locum'} ] · Locum`
    : `${person?.surname || name} · ${String(person?.category || 'Doctor').replace(/_/g, ' ')}`
  return {
    entryId: entry.id,
    rosterMonthId: entry.roster_month_id,
    date: String(entry.date).slice(0, 10),
    profileId: entry.profile_id || null,
    locumContactId: entry.locum_contact_id || null,
    locumName: entry.profile_id ? null : (locumName || null),
    isLocum,
    name: name || locumName || 'Locum',
    shiftCode: shiftType.code,
    shiftStart: hhmm(shiftStart),
    label: `${who} · ${shiftStartLabel(shiftStart)}`,
  }
}

const OPTION_COLUMNS = 'id, roster_month_id, date, profile_id, is_locum, locum_name, locum_contact_id, start_time_override, '
  + 'roster_months!inner(status, deleted_at), shift_types(code, start_time, sort_order), '
  + 'person:profiles!roster_entries_profile_id_fkey(name, surname, category, role)'

function toOptions(rows) {
  return (rows || [])
    .filter(r => !r.roster_months?.deleted_at)
    .map(r => ({ option: shiftOption(r, r.shift_types, r.person), order: r.shift_types?.sort_order ?? 0 }))
    .filter(x => x.option)
}

// Everyone rostered on a date in a published (or archived) roster: doctors
// and locums, in shift order.
export async function fetchShiftOptionsForDate(date) {
  const { data, error } = await supabase.from('roster_entries')
    .select(OPTION_COLUMNS)
    .eq('date', date)
    .in('roster_months.status', ['published', 'archived'])
  if (error) throw new Error(error.message)
  return toOptions(data)
    .sort((a, b) => a.order - b.order || a.option.name.localeCompare(b.option.name))
    .map(x => x.option)
}

// One person's rostered shifts in a year, newest first — the dates a late
// arrival can be logged for them.
export async function fetchShiftOptionsForProfile(profileId, year) {
  const { data, error } = await supabase.from('roster_entries')
    .select(OPTION_COLUMNS)
    .eq('profile_id', profileId)
    .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
    .in('roster_months.status', ['published', 'archived'])
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return toOptions(data).map(x => x.option)
}

const RECORD_COLUMNS = 'id, roster_entry_id, profile_id, locum_contact_id, locum_name, entry_date, shift_code, shift_start, arrived_at, '
  + 'minutes_late, reason_given, logged_by, created_at, updated_at, '
  + 'logger:profiles!late_arrivals_logged_by_fkey(name, surname)'

const live = () => supabase.from('late_arrivals').select(RECORD_COLUMNS).is('deleted_at', null)

// Admin reads. Each throws on error so a caller can tell "none" from
// "could not read".
export async function fetchLateArrivalsForProfile(profileId, year) {
  const { data, error } = await live().eq('profile_id', profileId)
    .gte('entry_date', `${year}-01-01`).lte('entry_date', `${year}-12-31`)
    .order('entry_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function fetchLateArrivalsInRange(from, to) {
  const { data, error } = await live().gte('entry_date', from).lte('entry_date', to)
  if (error) throw new Error(error.message)
  return data || []
}

export async function fetchLateArrivalForEntry(entryId) {
  const { data, error } = await live().eq('roster_entry_id', entryId).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

// A locum's records (they have no My year page): matched on the contact
// when the record has one, otherwise on the name on the roster. Newest first.
export async function fetchLateArrivalsForLocum({ contactId = null, name = '' }) {
  const reads = []
  if (contactId) reads.push(live().eq('locum_contact_id', contactId))
  if (name) reads.push(live().is('profile_id', null).is('locum_contact_id', null).eq('locum_name', name))
  const results = await Promise.all(reads)
  const rows = []
  for (const { data, error } of results) {
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
  }
  return rows.sort((x, y) => y.entry_date.localeCompare(x.entry_date))
}

// A doctor's own records: date, shift, shift start, arrival, minutes late
// and reason given — nothing else exists on this path. [] when staff
// visibility is off, and [] rather than an error when it cannot be read
// (offline, or ahead of the migration).
export async function fetchMyLateArrivals(year) {
  try {
    const { data, error } = await supabase.rpc('get_my_late_arrivals', { p_year: year })
    return error ? [] : (data || [])
  } catch {
    return []
  }
}

// Insert, or update the record this shift already has. Who and when are
// stamped by the database.
export async function saveLateArrival({ id = null, option, arrivedAt, reason }) {
  const minutes = minutesLate(option.shiftStart, arrivedAt)
  const fields = {
    arrived_at: hhmm(arrivedAt),
    minutes_late: minutes,
    reason_given: String(reason || '').trim() || null,
  }
  const existingId = id ?? (await fetchLateArrivalForEntry(option.entryId))?.id ?? null
  const res = existingId
    ? await supabase.from('late_arrivals').update(fields).eq('id', existingId)
    : await supabase.from('late_arrivals').insert({
        ...fields,
        roster_entry_id: option.entryId,
        profile_id: option.profileId,
        locum_contact_id: option.locumContactId,
        locum_name: option.locumName,
        entry_date: option.date,
        shift_code: option.shiftCode,
        shift_start: option.shiftStart,
      })
  if (res.error) throw new Error(res.error.message)
}

// Soft delete: the row stays, hidden everywhere.
export async function deleteLateArrival(id) {
  const { error } = await supabase.from('late_arrivals').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
