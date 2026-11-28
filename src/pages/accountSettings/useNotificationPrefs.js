import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// Your notification preferences and their save. Moved out of AccountSettingsPage as it was.
export function useNotificationPrefs({ user }) {
  const [prefs, setPrefs] = useState({})
  const [showAdvancedNotifications, setShowAdvancedNotifications] = useState(false)

  // ── Notification preferences (own account only) ─────────────
  // Accepts a batch of keys so "all notifications" / category-level toggles
  // can flip several at once in a single save.
  async function togglePrefs(keys, value) {
    const prev = prefs
    const next = { ...prefs }
    for (const key of keys) next[key] = value
    setPrefs(next)
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next })
      .eq('id', user.id)
    if (error) {
      setPrefs(prev)
      alert('Could not save notification preference: ' + error.message)
    }
  }

  return { prefs, setPrefs, showAdvancedNotifications, setShowAdvancedNotifications, togglePrefs }
}
