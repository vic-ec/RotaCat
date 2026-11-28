import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { flashSaved } from './accountSettingsHelpers'

// The mobile number row: the field, whether it changed, save and cancel. Moved out of AccountSettingsPage as it was.
export function usePhoneNumber({ profile, targetId, reloadTarget }) {
  const [phone, setPhone] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneJustSaved, setPhoneJustSaved] = useState(false)
  const [phoneMsg, setPhoneMsg] = useState(null)
  const [phoneEditing, setPhoneEditing] = useState(false)

  // ── Mobile number ─────────────────────────────────────────
  // A future round needs to gate a changed number behind an OTP
  // confirmation before it's saved, to verify the new number is reachable.
  const phoneDirty = (phone.trim() || null) !== (profile?.phone || null)

  async function savePhone(e) {
    e.preventDefault()
    setPhoneSaving(true)
    setPhoneMsg(null)

    const { error } = await supabase
      .from('profiles')
      .update({ phone: phone.trim() || null })
      .eq('id', targetId)

    setPhoneSaving(false)
    if (error) {
      setPhoneMsg({ type: 'error', text: error.message })
    } else {
      flashSaved(setPhoneJustSaved)
      reloadTarget()
    }
  }

  function cancelPhoneEdit() {
    setPhone(profile?.phone || '')
    setPhoneMsg(null)
    setPhoneEditing(false)
  }

  return { phone, setPhone, phoneSaving, phoneJustSaved, phoneMsg, phoneEditing, setPhoneEditing, phoneDirty, savePhone, cancelPhoneEdit }
}
