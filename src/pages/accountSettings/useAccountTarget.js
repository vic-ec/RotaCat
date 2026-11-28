import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { MISSING_ACCOUNT_MESSAGE, describeTargetLoadError } from './accountSettingsHelpers'

// The account being viewed when it isn't your own (an admin on /account/:id):
// its profile, email and load error, the reload after a save, and whether
// that person is on leave today. Moved out of AccountSettingsPage as it was.
export function useAccountTarget({ isOwnAccount, targetId, refreshProfile }) {
  const [targetProfile, setTargetProfile] = useState(null)
  const [targetLoadError, setTargetLoadError] = useState('')
  const [targetEmail, setTargetEmail] = useState('')
  const [isOnLeave, setIsOnLeave] = useState(false)

  // ── Load the account being viewed (self or, for admins, someone else) ──
  async function reloadTarget() {
    if (isOwnAccount) {
      await refreshProfile()
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle()
    if (error) setTargetLoadError(describeTargetLoadError(error))
    else if (!data) setTargetLoadError(MISSING_ACCOUNT_MESSAGE)
    else setTargetProfile(data)
  }

  useEffect(() => {
    if (isOwnAccount) return
    setTargetLoadError('')
    setTargetProfile(null)
    supabase.from('profiles').select('*').eq('id', targetId).maybeSingle().then(({ data, error }) => {
      if (error) setTargetLoadError(describeTargetLoadError(error))
      else if (!data) setTargetLoadError(MISSING_ACCOUNT_MESSAGE)
      else setTargetProfile(data)
    })
    supabase.rpc('get_staff_emails').then(({ data }) => {
      const row = (data || []).find(r => r.id === targetId)
      setTargetEmail(row?.email || '')
    })
  }, [targetId, isOwnAccount])

  useEffect(() => {
    if (!targetId) return
    supabase.rpc('get_current_leave_profile_ids').then(({ data }) => {
      setIsOnLeave((data || []).some(r => r.profile_id === targetId))
    })
  }, [targetId])

  return { targetProfile, targetLoadError, targetEmail, setTargetEmail, reloadTarget, isOnLeave }
}
