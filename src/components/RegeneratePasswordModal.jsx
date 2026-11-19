import Modal from './Modal'
import RegeneratePasswordPanel from './RegeneratePasswordPanel'

// The Staff list's row menu opens "Regenerate password" as a modal, since
// there is no section on that page for it to open into. The flow itself
// lives in RegeneratePasswordPanel — see that file — and the Account page
// renders the same panel inline under its own section header instead.
export default function RegeneratePasswordModal({ person, email, onClose }) {
  return (
    <Modal title="Regenerate password" onClose={onClose}>
      <RegeneratePasswordPanel person={person} email={email} onCancel={onClose} onDone={onClose} />
    </Modal>
  )
}
