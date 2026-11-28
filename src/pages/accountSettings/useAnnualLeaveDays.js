import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { flashSaved } from './accountSettingsHelpers'

// Admin: this year's annual leave allotment for the account being viewed. Moved out of AccountSettingsPage as it was.
export function useAnnualLeaveDays({ targetId, isAdmin }) {
  // Admin: this year's annual leave day allotment (annual_leave_balances,
  // a separate table from profiles — its own load/save, not part of
  // saveAdminAccountFields). Plain per-doctor override, no default-by-
  // category logic — days_allotted stays null/blank until an admin sets it.
  const currentYear = new Date().getFullYear()
  const [annualLeaveDays, setAnnualLeaveDays] = useState('')
  const [annualLeaveDaysLoaded, setAnnualLeaveDaysLoaded] = useState('')
  const [annualLeaveDaysSaving, setAnnualLeaveDaysSaving] = useState(false)
  const [annualLeaveDaysJustSaved, setAnnualLeaveDaysJustSaved] = useState(false)
  const [annualLeaveDaysMsg, setAnnualLeaveDaysMsg] = useState(null)

  useEffect(() => {
    if (!targetId || !isAdmin) return
    setAnnualLeaveDaysMsg(null)
    supabase
      .from('annual_leave_balances')
      .select('days_allotted')
      .eq('profile_id', targetId)
      .eq('year', currentYear)
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.days_allotted ?? ''
        setAnnualLeaveDays(String(value))
        setAnnualLeaveDaysLoaded(String(value))
      })
  }, [targetId, isAdmin, currentYear])

  async function saveAnnualLeaveDays() {
    setAnnualLeaveDaysSaving(true)
    setAnnualLeaveDaysMsg(null)

    const parsed = annualLeaveDays === '' ? null : Number(annualLeaveDays)
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setAnnualLeaveDaysSaving(false)
      setAnnualLeaveDaysMsg({ type: 'error', text: 'Enter a non-negative number of days.' })
      return
    }

    const { error } = await supabase
      .from('annual_leave_balances')
      .upsert({ profile_id: targetId, year: currentYear, days_allotted: parsed }, { onConflict: 'profile_id,year' })

    setAnnualLeaveDaysSaving(false)
    if (error) {
      setAnnualLeaveDaysMsg({ type: 'error', text: error.message })
    } else {
      setAnnualLeaveDaysLoaded(annualLeaveDays)
      flashSaved(setAnnualLeaveDaysJustSaved)
    }
  }

  return {
    currentYear, annualLeaveDays, setAnnualLeaveDays, annualLeaveDaysLoaded, annualLeaveDaysSaving,
    annualLeaveDaysJustSaved, annualLeaveDaysMsg, saveAnnualLeaveDays,
  }
}
