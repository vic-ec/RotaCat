// Who covers a shift, and how that is written to a roster entry.
//
// A `cover` is one of:
//   { kind: 'doctor', id }                    a rostered doctor
//   { kind: 'locum', id, name }               a locum with an account
//   { kind: 'placeholder', id, name }         a locum with no account yet
//                                             (locum_placeholders row)
//
// Locum rows keep the convention the roster already uses: is_locum true,
// the name in locum_name (what the grid prints), profile_id set once the
// locum has an account, and counts_toward_contract_hours false — a locum
// has no contract hours to count towards.
import { supabase } from './supabase'

const CLEAR_FLAGS = { is_manual_override: true, is_flagged: false, flag_type: null, flag_reason: null }

export function coverPatch(cover) {
  if (cover.kind === 'locum') {
    return {
      profile_id: cover.id, is_locum: true, locum_name: cover.name, locum_placeholder_id: null,
      counts_toward_contract_hours: false, ...CLEAR_FLAGS,
    }
  }
  if (cover.kind === 'placeholder') {
    return {
      profile_id: null, is_locum: true, locum_name: cover.name, locum_placeholder_id: cover.id,
      counts_toward_contract_hours: false, ...CLEAR_FLAGS,
    }
  }
  return { profile_id: cover.id, is_locum: false, locum_name: null, locum_placeholder_id: null, ...CLEAR_FLAGS }
}

export const fullName = p => `${p?.name || ''} ${p?.surname || ''}`.trim()

// The profile id a cover puts on the entry — null for a placeholder, which
// has none yet.
export const coverProfileId = cover => (cover.kind === 'placeholder' ? null : cover.id)

// Locums with an account, for the roster's picker. Never throws.
export async function fetchLocumProfiles() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, surname, category, color_code, pattern_type, is_active')
      .eq('role', 'locum')
      .eq('is_approved', true)
      .order('surname', { ascending: true })
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

// Locums on the roster with no account yet. Admin-only by RLS, so anyone
// else simply gets none. Never throws.
export async function fetchOpenLocumPlaceholders() {
  try {
    const { data, error } = await supabase
      .from('locum_placeholders')
      .select('id, name, surname, phone, created_at')
      .is('linked_profile_id', null)
      .order('surname', { ascending: true })
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

export async function createLocumPlaceholder({ name, surname, phone, createdBy }) {
  const { data, error } = await supabase
    .from('locum_placeholders')
    .insert({ name: name.trim(), surname: surname.trim(), phone, created_by: createdBy })
    .select('id, name, surname, phone')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// How many shifts sit under each placeholder, for the Staff page's list.
export async function fetchPlaceholderShiftCounts(placeholderIds) {
  const counts = new Map()
  if (!placeholderIds?.length) return counts
  try {
    const { data } = await supabase.from('roster_entries').select('locum_placeholder_id').in('locum_placeholder_id', placeholderIds)
    for (const row of data || []) counts.set(row.locum_placeholder_id, (counts.get(row.locum_placeholder_id) || 0) + 1)
  } catch { /* counts stay empty */ }
  return counts
}

// The account now exists: move every shift filed under the placeholder onto
// it, then mark the placeholder linked so it drops off the Staff page's
// list. Shifts first — if the second write fails the placeholder just stays
// listed and linking can be run again, with nothing lost.
export async function linkLocumPlaceholder({ placeholderId, profileId }) {
  const { error: entriesErr } = await supabase
    .from('roster_entries')
    .update({ profile_id: profileId, locum_placeholder_id: null })
    .eq('locum_placeholder_id', placeholderId)
  if (entriesErr) throw new Error(entriesErr.message)
  const { error } = await supabase
    .from('locum_placeholders')
    .update({ linked_profile_id: profileId, linked_at: new Date().toISOString() })
    .eq('id', placeholderId)
  if (error) throw new Error(error.message)
}
