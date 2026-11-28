import Modal from '../../components/Modal'
import GeneratedPasswordNotice from '../../components/GeneratedPasswordNotice'
import { TEMP_PASSWORD_VALIDITY_DAYS } from '../../lib/tempPassword'

// The super-admin's email change: its confirmation, then its result. Moved out of AccountSettingsPage as it was.
export default function AdminEmailDialogs({ adminEmailDialog, setAdminEmailDialog, adminEmailSaving, confirmAdminEmailChange, targetFullName, targetEmail }) {
  return (
    <>
    {adminEmailDialog?.stage === 'confirm' && (
      <Modal
        title="Change email address"
        onClose={adminEmailSaving ? () => {} : () => setAdminEmailDialog(null)}
        footer={
          <>
            <button type="button" className="btn-primary" onClick={confirmAdminEmailChange} disabled={adminEmailSaving}>
              {adminEmailSaving ? 'Changing…' : 'Change email'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAdminEmailDialog(null)} disabled={adminEmailSaving}>
              Cancel
            </button>
          </>
        }
      >
        <p className="text-sm text-ink">
          {targetFullName}&rsquo;s login email will change from{' '}
          <strong className="break-words font-semibold">{targetEmail || 'no address'}</strong> to{' '}
          <strong className="break-words font-semibold">{adminEmailDialog.email}</strong>.
        </p>
        {adminEmailDialog.send && (
          <p className="mt-3 text-sm text-ink">
            A new temporary password will be emailed to{' '}
            <strong className="break-words font-semibold">{adminEmailDialog.email}</strong>.
          </p>
        )}
      </Modal>
    )}

    {adminEmailDialog?.stage === 'result' && (() => {
      const { email, result } = adminEmailDialog
      const close = () => setAdminEmailDialog(null)
      return (
        <Modal
          title="Email changed"
          onClose={close}
          footer={<button type="button" className="btn-primary" onClick={close}>Done</button>}
        >
          {!result.credentialsIssued ? (
            <p className="text-sm text-ink">
              {result.credentialsError || 'Email changed.'}
            </p>
          ) : result.emailSent ? (
            <p className="text-sm text-ink">
              Email changed. Login details sent to <span className="break-words">{email}</span>.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                Email changed and a new temporary password set, but the login details could not be emailed
                {result.emailError ? ` (${result.emailError})` : ''}. Their previous password no longer works.
                Valid for {TEMP_PASSWORD_VALIDITY_DAYS} days.
              </p>
              {result.password && <GeneratedPasswordNotice password={result.password} />}
            </>
          )}
        </Modal>
      )
    })()}
    </>
  )
}
