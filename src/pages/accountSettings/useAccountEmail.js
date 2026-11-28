import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { changeStaffEmail } from '../../lib/staffCredentials'

// The email row: your own change (confirmation links to both inboxes) and
// the super-admin's change of someone else's login email. Moved out of AccountSettingsPage as it was.
export function useAccountEmail({ user, isOwnAccount, isSuperAdmin, targetId, targetEmail, setTargetEmail, reloadTarget }) {
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)
  const [emailEditing, setEmailEditing] = useState(false)
  // Super-admin changing SOMEONE ELSE's login email (admin-staff-credentials
  // `change_email`) — a different operation from the self-service change
  // above it shares the row with: immediate, no confirmation links, and
  // optionally issuing a new temporary password to the new address.
  const canAdminChangeEmail = isSuperAdmin && !isOwnAccount
  const [adminEmailSend, setAdminEmailSend] = useState(true)
  // null, or { stage: 'confirm' | 'result', email, send, result? }
  const [adminEmailDialog, setAdminEmailDialog] = useState(null)
  const [adminEmailSaving, setAdminEmailSaving] = useState(false)
  // Admin issuing someone else a new temporary password from this page.

  // These three depend on `user`'s primitives rather than the object: it is
  // rebuilt from storage on every auth event, including the SIGNED_IN
  // auth-js re-emits each time the tab is refocused, so depending on its
  // identity re-ran the two queries below on every return to the page.
  useEffect(() => {
    if (isOwnAccount && user) setNewEmail(user.email || '')
  }, [user, user?.email, isOwnAccount])

  // Someone else's account: the super-admin's edit field starts from that
  // person's current address.
  useEffect(() => {
    if (!isOwnAccount) setNewEmail(targetEmail || '')
  }, [targetEmail, isOwnAccount])

  // ── Email (own account only — Supabase auth can only change the logged-in user's own email) ──
  const emailDirty = Boolean(newEmail) && newEmail !== user.email

  async function changeEmail(e) {
    e.preventDefault()
    setEmailMsg(null)

    if (!newEmail || newEmail === user.email) {
      setEmailMsg({ type: 'error', text: 'Enter a different email address.' })
      return
    }

    setEmailSaving(true)
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setEmailSaving(false)

    if (error) {
      setEmailMsg({ type: 'error', text: error.message })
    } else {
      setEmailMsg({
        type: 'success',
        text: 'Check both your old and new inbox for confirmation links — the change only applies once confirmed.',
      })
    }
  }

  function cancelEmailEdit() {
    setNewEmail((isOwnAccount ? user?.email : targetEmail) || '')
    setAdminEmailSend(true)
    setEmailMsg(null)
    setEmailEditing(false)
  }

  // ── Email (super-admin, someone else's account) ──────────────
  // Deliberately not changeEmail() above: that is supabase.auth.updateUser,
  // which can only ever change the signed-in user's own address.
  const adminNewEmail = newEmail.trim().toLowerCase()
  const adminEmailDirty = Boolean(adminNewEmail) && adminNewEmail !== (targetEmail || '').toLowerCase()

  // Save only opens the confirmation — nothing is sent until "Change email".
  function askAdminEmailChange(e) {
    e.preventDefault()
    setEmailMsg(null)
    if (!adminEmailDirty) {
      setEmailMsg({ type: 'error', text: 'Enter a different email address.' })
      return
    }
    setAdminEmailDialog({ stage: 'confirm', email: adminNewEmail, send: adminEmailSend })
  }

  async function confirmAdminEmailChange() {
    const { email, send } = adminEmailDialog
    setAdminEmailSaving(true)
    const result = await changeStaffEmail(targetId, email, send)
    setAdminEmailSaving(false)

    if (!result.ok) {
      // Back to the form, still open and still holding what was typed.
      setAdminEmailDialog(null)
      setEmailMsg({ type: 'error', text: result.error })
      return
    }

    setAdminEmailDialog({ stage: 'result', email: result.email || email, send, result })
    setTargetEmail(result.email || email)
    setAdminEmailSend(true)
    setEmailMsg(null)
    setEmailEditing(false)
    // The verified tick and the temp-password fields live on the profile.
    reloadTarget()
  }

  return {
    newEmail, setNewEmail, emailSaving, emailMsg, emailEditing, setEmailEditing, canAdminChangeEmail,
    adminEmailSend, setAdminEmailSend, adminEmailDialog, setAdminEmailDialog, adminEmailSaving, emailDirty,
    changeEmail, cancelEmailEdit, adminEmailDirty, askAdminEmailChange, confirmAdminEmailChange,
  }
}
