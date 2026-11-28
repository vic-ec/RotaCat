import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCapsLockWarning } from '../../lib/useCapsLockWarning'
import { passwordProblem } from '../../lib/passwordPolicy'
import { flashSaved } from './accountSettingsHelpers'

// Changing your own password. Moved out of AccountSettingsPage as it was.
export function usePasswordChange({ user }) {
  const [pwForm, setPwForm] = useState({ current: '', password: '', confirm: '' })
  const pwCapsLock = useCapsLockWarning()
  const [pwSaving, setPwSaving] = useState(false)
  const [pwJustSaved, setPwJustSaved] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  // ── Password (own account only) ──────────────────────────────
  const pwDirty = Boolean(pwForm.current || pwForm.password || pwForm.confirm)

  async function changePassword(e) {
    e.preventDefault()
    setPwMsg(null)

    if (!pwForm.current) {
      setPwMsg({ type: 'error', text: 'Enter your current password.' })
      return
    }
    const pwProblem = passwordProblem(pwForm.password)
    if (pwProblem) {
      setPwMsg({ type: 'error', text: pwProblem })
      return
    }
    if (pwForm.password !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setPwSaving(true)

    // Verify the current password by re-authenticating before changing it.
    // Kept even though current_password is sent below: this check holds
    // regardless of the "Require current password when updating" setting, so
    // flipping that off in the dashboard can't silently drop the check.
    // It also refreshes the session, satisfying "Secure password change"'s
    // recently-logged-in window.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwForm.current,
    })
    if (verifyError) {
      setPwSaving(false)
      setPwMsg({ type: 'error', text: 'Current password is incorrect.' })
      return
    }

    // current_password is required by Supabase Auth's "Require current password
    // when updating" setting — without it the update is rejected outright.
    // Deliberately not passing `email` alongside it: that would start an email
    // change, and "Secure email change" would fire confirmations to both
    // addresses.
    const { error } = await supabase.auth.updateUser({
      current_password: pwForm.current,
      password: pwForm.password,
    })
    setPwSaving(false)

    if (error) {
      setPwMsg({ type: 'error', text: error.message })
    } else {
      flashSaved(setPwJustSaved)
      setPwForm({ current: '', password: '', confirm: '' })
    }
  }

  function resetPasswordForm() {
    setPwForm({ current: '', password: '', confirm: '' })
    setPwMsg(null)
  }

  return { pwForm, setPwForm, pwCapsLock, pwSaving, pwJustSaved, pwMsg, pwDirty, changePassword, resetPasswordForm }
}
