import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DAYS_IN_MONTH, dayMonthToBirthday, flashSaved } from './accountSettingsHelpers'

// Name, surname and birthday: the form, whether it changed, and its save. Moved out of AccountSettingsPage as it was.
export function useProfileForm({ profile, targetId, reloadTarget }) {
  const [form, setForm] = useState({ name: '', surname: '', birthdayDay: '', birthdayMonth: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileJustSaved, setProfileJustSaved] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // ── Profile details ─────────────────────────────────────────
  // Day and month are kept as independent fields (not derived from a single
  // combined date) so picking just one of them doesn't get discarded while
  // waiting for the other — that was the earlier bug where a lone pick
  // silently reverted back to the placeholder.
  function setBirthdayPart(part, value) {
    setForm(f => {
      let day = part === 'day' ? value : f.birthdayDay
      let month = part === 'month' ? value : f.birthdayMonth
      if (day && month) {
        const maxDay = DAYS_IN_MONTH[Number(month) - 1]
        if (Number(day) > maxDay) day = String(maxDay)
      }
      return { ...f, birthdayDay: day, birthdayMonth: month }
    })
  }

  // `profile` is briefly null right after navigating to someone else's
  // account (or on first load) while it's still being fetched — these run
  // on every render regardless, so they must tolerate that instead of
  // crashing the whole app on a bare `profile.x` dereference.
  const profileDirty =
    form.name.trim() !== (profile?.name || '') ||
    form.surname.trim() !== (profile?.surname || '') ||
    (dayMonthToBirthday(form.birthdayDay, form.birthdayMonth) || null) !== (profile?.birthday || null)

  async function saveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)

    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        surname: form.surname.trim(),
        birthday: dayMonthToBirthday(form.birthdayDay, form.birthdayMonth) || null,
      })
      .eq('id', targetId)

    setSavingProfile(false)
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      flashSaved(setProfileJustSaved)
      reloadTarget()
    }
  }

  return { form, setForm, savingProfile, profileJustSaved, profileMsg, setBirthdayPart, profileDirty, saveProfile }
}
