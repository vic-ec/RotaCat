// What the Dashboard's contact card shows for someone on shift: their name,
// mobile and email. A doctor (or a locum with an account) is read from
// their profile, with the email from get_staff_emails (the Staff list's
// source, visible to approved staff); a locum with no account from their
// contact record (admins only, by RLS). Never throws: what can't be read
// comes back empty and the card says so.
import { supabase } from './supabase'

export async function fetchContactCard({ profileId = null, contactId = null } = {}) {
  try {
    if (profileId) {
      const [profileRes, emailsRes] = await Promise.all([
        supabase.from('profiles').select('id, name, surname, phone, email_verified, category, role').eq('id', profileId).maybeSingle(),
        Promise.resolve(supabase.rpc('get_staff_emails')).catch(() => ({ data: [] })),
      ])
      const p = profileRes?.data
      if (!p) return null
      const email = (emailsRes?.data || []).find(r => r.id === profileId)?.email || null
      return { name: `${p.name || ''} ${p.surname || ''}`.trim(), phone: p.phone || null, email, emailVerified: Boolean(p.email_verified) }
    }
    if (contactId) {
      const { data } = await supabase.from('locum_contacts').select('id, name, surname, phone').eq('id', contactId).maybeSingle()
      if (!data) return null
      return { name: `${data.name || ''} ${data.surname || ''}`.trim(), phone: data.phone || null, email: null, emailVerified: false, noAccount: true }
    }
  } catch {
    return null
  }
  return null
}
