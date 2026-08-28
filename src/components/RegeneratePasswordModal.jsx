import { useState } from 'react'
import Modal from './Modal'
import GeneratedPasswordNotice from './GeneratedPasswordNotice'
import { regenerateStaffPassword } from '../lib/staffCredentials'

// "Regenerate password" — for anyone who lost the welcome email an admin
// created their account with, or never got it (spam, a mistyped address
// since corrected). Issues a fresh password, invalidating the previous
// one, and puts the account back behind the forced set-your-own-password
// screen on next sign-in.
//
// Nothing here expires, because nothing here is a link: this can be run
// again as many times as needed, with no window to beat. It leaves
// is_approved untouched — replacing a credential is not a re-vetting of
// who this person is, and this must never push someone back into the
// pending-approval queue.
//
// Confirmed before it runs because it is destructive to a credential the
// person may currently be using: the moment it succeeds, their existing
// password stops working.
export default function RegeneratePasswordModal({ person, onClose }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const firstName = person.name || person.surname || 'this person'
  const fullName = `${person.name ? `${person.name} ` : ''}${person.surname || ''}`.trim() || 'This person'

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
            A new password has been emailed to {fullName}. Their previous password no longer works,
            and they&apos;ll be asked to set their own the next time they sign in.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {fullName}&apos;s password was reset, but the email could not be sent
              {result.emailError ? ` (${result.emailError})` : ''}. Their previous password no longer works.
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
        This issues {firstName} a brand-new password and emails it to them. Their current password
        stops working immediately, and they&apos;ll have to set their own password the next time they
        sign in.
      </p>
      <p className="mt-3 text-xs text-ink-muted">
        Safe to repeat — there&apos;s no link and no expiry involved, so it can be run again if the
        email still doesn&apos;t arrive. It doesn&apos;t affect their account&apos;s approval or
        active status.
      </p>

      {error && (
        <div className="mt-3 rounded bg-flagRed-bg px-3 py-2 text-sm text-flagRed">{error}</div>
      )}
    </Modal>
  )
}
