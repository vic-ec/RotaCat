import Modal from './Modal'

// Exact copy per direction — Active->Inactive is framed as consequential
// (exclusion from everything going forward) since it pulls someone out of
// all future scheduling; Inactive->Active is framed as low-risk (nothing
// retroactive) since it's just re-including them. Not reused for the
// "Schedule deactivation" queue action (see the end-of-rotation flag) —
// that's a deferred action with different semantics and needs its own,
// softer wording.
function confirmMessage(firstName, nextActive) {
  return nextActive
    ? `Setting ${firstName}'s status to active will include them in future rosters, leave scheduling, and weekend assignments again from this point on. This won't change anything retroactively — their past shifts and leave stay exactly as recorded. Continue?`
    : `Setting ${firstName}'s status to inactive will exclude them from all future rostering, leave scheduling, and weekend assignments from this point on. Their current shifts and leave will not be affected — they will not be included in new rosters, will not be able to schedule leave, and cannot be assigned to future weekends. Do you want to continue?`
}

// Confirmation gate in front of the two legitimate admin-driven is_active
// changes (StaffListPage's Status toggle, AccountSettingsPage's admin
// Toggle) — this is a consequential action (excludes someone from all
// future scheduling, or re-includes them) that previously fired on a
// single click with no confirmation at all. Cancel closes with no update;
// Confirm runs the caller's existing toggle/save logic unchanged — this
// component only inserts the extra step in front of it.
export default function StatusChangeConfirmModal({ firstName, nextActive, saving, onConfirm, onClose }) {
  const name = firstName || 'This person'
  return (
    <Modal
      title={nextActive ? 'Set to active?' : 'Set to inactive?'}
      onClose={onClose}
      maxWidthClassName="md:max-w-[440px]"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink">{confirmMessage(name, nextActive)}</p>
    </Modal>
  )
}
