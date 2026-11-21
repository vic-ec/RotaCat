// Who covers a shift, and how that is written to a roster entry.
//
// A `cover` is one of:
//   { kind: 'doctor', id }                     a rostered doctor
//   { kind: 'locum', id, name, surname }       a locum with an account
//   { kind: 'contact', id, name, surname }     a locum with no account yet
//                                              (locum_contacts row: just a
//                                              name and a mobile number)
//
// Locum rows keep the convention the roster already uses: is_locum true,
// the label in locum_name (what the grid prints), profile_id set once the
// locum has an account, and counts_toward_contract_hours false — a locum
// has no contract hours to count towards.
//
// The label says whether the slot is filled:
//   "[ ]"        an open locum slot — nobody yet
//   "[Surname]"  a filled one, account or not
import { supabase } from './supabase'

const CLEAR_FLAGS = { is_manual_override: true, is_flagged: false, flag_type: null, flag_reason: null }

export const OPEN_LOCUM_LABEL = '[ ]'

// "[Surname]". Falls back to the last word of a full name for a cover that
// carries no separate surname.
export function locumLabel(cover) {
  const surname = (cover?.surname || '').trim() || (cover?.name || '').trim().split(/\s+/).pop() || ''
  return surname ? `[${surname}]` : OPEN_LOCUM_LABEL
}

// The name inside the brackets, or '' for an open slot's "[ ]".
export function locumDisplayName(label) {
  return (label || '').replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim()
}

// A locum slot nobody is on: no profile and no name in the brackets.
export function isOpenLocumSlot(entry) {
  return Boolean(entry?.is_locum) && !entry.profile_id && !locumDisplayName(entry.locum_name)
}

// A shift opened for cover: it becomes an open locum slot, the same thing
// the generator leaves where it could not fill a shift, so one kind of
// "open" exists on the roster (and one thing to advertise).
export const OPEN_SLOT_PATCH = {
  profile_id: null,
  is_locum: true,
  locum_name: OPEN_LOCUM_LABEL,
  locum_contact_id: null,
  is_manual_override: false,
  is_flagged: false,
  flag_type: null,
  flag_reason: null,
}

export function coverPatch(cover) {
  if (cover.kind === 'locum') {
    return {
      profile_id: cover.id, is_locum: true, locum_name: locumLabel(cover), locum_contact_id: null,
      counts_toward_contract_hours: false, ...CLEAR_FLAGS,
    }
  }
  if (cover.kind === 'contact') {
    return {
      profile_id: null, is_locum: true, locum_name: locumLabel(cover), locum_contact_id: cover.id,
      counts_toward_contract_hours: false, ...CLEAR_FLAGS,
    }
  }
  return { profile_id: cover.id, is_locum: false, locum_name: null, locum_contact_id: null, ...CLEAR_FLAGS }
}

export const fullName = p => `${p?.name || ''} ${p?.surname || ''}`.trim()

// The profile id a cover puts on the entry — null for a contact, which
// has none yet.
export const coverProfileId = cover => (cover.kind === 'contact' ? null : cover.id)

// Locums with an account, for the roster's picker. Never throws.
export async function fetchLocumProfiles() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, surname, phone, category, color_code, pattern_type, is_active')
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
export async function fetchOpenLocumContacts() {
  try {
    const { data, error } = await supabase
      .from('locum_contacts')
      .select('id, name, surname, phone, created_at')
      .is('linked_profile_id', null)
      .order('surname', { ascending: true })
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

export async function createLocumContact({ name, surname, phone, createdBy }) {
  const { data, error } = await supabase
    .from('locum_contacts')
    .insert({ name: name.trim(), surname: surname.trim(), phone, created_by: createdBy })
    .select('id, name, surname, phone')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// How many shifts sit under each contact, for the Staff page's list.
export async function fetchContactShiftCounts(contactIds) {
  const counts = new Map()
  if (!contactIds?.length) return counts
  try {
    const { data } = await supabase.from('roster_entries').select('locum_contact_id').in('locum_contact_id', contactIds)
    for (const row of data || []) counts.set(row.locum_contact_id, (counts.get(row.locum_contact_id) || 0) + 1)
  } catch { /* counts stay empty */ }
  return counts
}

// Two mobile numbers are the same person's when their last nine digits
// match: "082 123 4567", "0821234567" and "+27 82 123 4567" all compare
// equal. Null for anything too short to be a number.
export function phoneKey(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : null
}

// The contact (or account) whose mobile matches `phone`, or null.
export function findByPhone(rows, phone) {
  const key = phoneKey(phone)
  if (!key) return null
  return (rows || []).find(r => phoneKey(r.phone) === key) || null
}

// The account now exists: move every shift filed under the contact onto
// it, then mark the contact linked so it drops off the Staff page's
// list. Shifts first — if the second write fails the contact just stays
// listed and linking can be run again, with nothing lost.
export async function linkLocumContact({ contactId, profileId }) {
  const { error: entriesErr } = await supabase
    .from('roster_entries')
    .update({ profile_id: profileId, locum_contact_id: null })
    .eq('locum_contact_id', contactId)
  if (entriesErr) throw new Error(entriesErr.message)
  const { error } = await supabase
    .from('locum_contacts')
    .update({ linked_profile_id: profileId, linked_at: new Date().toISOString() })
    .eq('id', contactId)
  if (error) throw new Error(error.message)
}

// The message an admin sends from their own WhatsApp — the app sends
// nothing itself. Asks the locum to register with the SAME mobile number,
// which is what lets their approval find the shifts already on the roster.
export function locumInviteText({ name, signupUrl }) {
  return `Hi ${name}, you have been added to the VHW Emergency Centre roster on RotaCat. `
    + `Please register as a locum using this mobile number so your shifts link to your account: ${signupUrl}`
}
