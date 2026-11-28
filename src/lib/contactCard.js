// What the Dashboard's contact card shows for someone on shift: their name,
// mobile and email. A doctor (or a locum with an account) is read from
// their profile, with the email from get_staff_emails (the Staff list's
// source, visible to approved staff); a locum with no account from their
// contact record (admins only, by RLS). Never throws: what can't be read
// comes back empty and the card says so.
//
// Kept in memory so the menu opens at once: one shared copy of the
// get_staff_emails list (it holds everyone's email, so it is read once and
// reused for CACHE_MS, not once per tap), and the cards already built. The
// On shift board fills both in the background as it loads
// (prefetchContactCards), from profile columns it already reads.
import { supabase } from './supabase'

export const CACHE_MS = 5 * 60 * 1000

let emailsCache = null // { at, list } once read
let emailsInFlight = null
const cards = new Map() // 'p:<profileId>' | 'c:<contactId>' -> { at, card }

const keyOf = ({ profileId = null, contactId = null } = {}) => (profileId ? `p:${profileId}` : contactId ? `c:${contactId}` : null)
const fresh = at => Date.now() - at < CACHE_MS
const fullName = p => `${p?.name || ''} ${p?.surname || ''}`.trim()

// The get_staff_emails list, [{ id, email }], shared by every caller for
// CACHE_MS; concurrent callers share one request. null when it can't be
// read — a failure isn't kept, so the next open tries again.
export function getStaffEmails() {
  if (emailsCache && fresh(emailsCache.at)) return Promise.resolve(emailsCache.list)
  if (emailsInFlight) return emailsInFlight
  emailsInFlight = Promise.resolve(supabase.rpc('get_staff_emails'))
    .then(res => {
      if (res?.error || !Array.isArray(res?.data)) return null
      emailsCache = { at: Date.now(), list: res.data }
      return res.data
    })
    .catch(() => null)
    .finally(() => { emailsInFlight = null })
  return emailsInFlight
}

function cardFromProfile(p, emails) {
  const email = (emails || []).find(r => r.id === p.id)?.email || null
  return { name: fullName(p), phone: p.phone || null, email, emailVerified: Boolean(p.email_verified) }
}

// The card already in memory for this person, or undefined when there is
// none (or it is older than CACHE_MS) and it has to be fetched.
export function getCachedContactCard(target) {
  const key = keyOf(target)
  const hit = key && cards.get(key)
  return hit && fresh(hit.at) ? hit.card : undefined
}

// Builds cards in the background for the people a page already has profile
// rows for (id, name, surname, phone, email_verified). A row without the
// phone / email_verified columns (an older cached response, say) is
// skipped, so its card is fetched when opened instead of showing as
// having no mobile. Never throws.
export function prefetchContactCards(profiles = []) {
  const usable = (profiles || []).filter(p => p?.id && 'phone' in p && 'email_verified' in p)
  if (usable.length === 0) return Promise.resolve()
  return getStaffEmails().then(emails => {
    // Without the email list a card would show "No email on file" for
    // everyone; leave them to the fetch on open.
    if (!emails) return
    const at = Date.now()
    for (const p of usable) cards.set(`p:${p.id}`, { at, card: cardFromProfile(p, emails) })
  }).catch(() => {})
}

export async function fetchContactCard({ profileId = null, contactId = null } = {}) {
  const cached = getCachedContactCard({ profileId, contactId })
  if (cached !== undefined) return cached
  try {
    if (profileId) {
      const [profileRes, emails] = await Promise.all([
        supabase.from('profiles').select('id, name, surname, phone, email_verified, category, role').eq('id', profileId).maybeSingle(),
        getStaffEmails(),
      ])
      const p = profileRes?.data
      if (!p) return null
      const card = cardFromProfile({ ...p, id: profileId }, emails)
      // Kept only when the email list came back, so a passing failure
      // doesn't stick as "No email on file".
      if (emails) cards.set(`p:${profileId}`, { at: Date.now(), card })
      return card
    }
    if (contactId) {
      const { data } = await supabase.from('locum_contacts').select('id, name, surname, phone').eq('id', contactId).maybeSingle()
      if (!data) return null
      const card = { name: fullName(data), phone: data.phone || null, email: null, emailVerified: false, noAccount: true }
      cards.set(`c:${contactId}`, { at: Date.now(), card })
      return card
    }
  } catch {
    return null
  }
  return null
}

// Forgets everything (tests; sign-out could use it too).
export function clearContactCache() {
  emailsCache = null
  emailsInFlight = null
  cards.clear()
}
