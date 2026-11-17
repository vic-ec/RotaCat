import { useState } from 'react'
import Modal from './Modal'
import GeneratedPasswordNotice from './GeneratedPasswordNotice'
import { regenerateStaffPassword } from '../lib/staffCredentials'
import { TEMP_PASSWORD_VALIDITY_DAYS } from '../lib/tempPassword'

// "Regenerate password" — for anyone who lost the welcome email an admin
// created their account with, or never got it (spam, a mistyped address
// since corrected). Issues a fresh temporary password, invalidating the
// previous one, and puts the account back behind the forced
// set-your-own-password screen on next sign-in.
//
// Opened from two places — the Staff list's row menu and the Security &
// Access section of someone else's Account page — and it is this one
// component in both. `email` is optional: where the caller has the
// person's address it is shown as the destination, otherwise the wording
// simply leaves it out.
//
// There is no link here, so this can be run again as many times as needed.
// The password it issues is temporary, though: it stops working after
// TEMP_PASSWORD_VALIDITY_DAYS, and each run restarts that window. It
// leaves is_approved untouched — replacing a credential is not a
// re-vetting of who this person is, and this must never push someone back
// into the pending-approval queue.
//
// Confirmed before it runs because it is destructive to a credential the
// person may currently be using: the moment it succeeds, their existing
// password stops working.
export default function RegeneratePasswordModal({ person, email, onClose }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const firstName = person.name || person.surname || 'this person'
  const fullName = `${person.name ? `${person.name} ` : ''}${person.surname || ''}`.trim() || 'This person'
  const days = TEMP_PASSWORD_VALIDITY_DAYS

  async function handleConfirm() {
    setError('')
    setSubmitting(true)
    const response = await regenerateStaffPassword(person.id)
    setSubmitting(false)

    if (!response.ok) {
      setError(response.error)
      return
    }
    setResult(response)
  }

  if (result) {
    return (
      <Modal
        title={result.emailSent ? 'New password sent' : 'New password set — email not sent'}
        onClose={onClose}
        footer={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}
      >
        {result.emailSent ? (
          <p className="text-sm text-ink">
            A new temporary password has been emailed to {fullName}{email ? ` at ${email}` : ''}. It
            is valid for {days} days, and they&apos;ll be asked to set their own the next time they
            sign in.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {fullName}&apos;s password was reset, but the email could not be sent
              {result.emailError ? ` (${result.emailError})` : ''}. Their previous password no longer works.
              Valid for {days} days.
            </p>
            {result.password && <GeneratedPasswordNotice password={result.password} />}
          </>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="Regenerate password"
      onClose={submitting ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Generating…' : 'Regenerate and email'}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink">
        This issues {firstName} a new temporary password and emails it
        {email ? <> to <strong className="font-semibold break-words">{email}</strong></> : ' to them'}.
        {' '}Their current password stops working immediately.
      </p>
      <p className="mt-3 text-xs text-ink-muted">
        The temporary password is valid for {days} days. They&apos;ll be asked to set their own
        password the first time they sign in. Safe to repeat if the email doesn&apos;t arrive. It
        doesn&apos;t affect their approval or active status.
      </p>

      {error && (
        <div className="mt-3 rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>
      )}
    </Modal>
  )
}
