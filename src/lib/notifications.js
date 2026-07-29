// Thin wrapper around the notifications table. There's no existing frontend
// call site to reuse (checked — nothing inserts into this table yet), but
// the schema/enum convention (notification_type, notification_prefs keys in
// AccountSettingsPage) is already established; this just writes to it.
import { supabase } from './supabase'

export async function createNotification({ profileId, type, title, body, link = null }) {
  return supabase.from('notifications').insert({ profile_id: profileId, type, title, body, link })
}
