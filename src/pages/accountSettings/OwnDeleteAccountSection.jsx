import SectionLabel from '../../components/SectionLabel'
import SectionRow from './SectionRow'
import { TrashIcon } from './icons'

// Danger Zone: requesting deletion of your own account. Moved out of AccountSettingsPage as it was.
export default function OwnDeleteAccountSection({ pendingDeletion, deleteConfirming, requestDeletion, deleteSaving, setDeleteConfirming }) {
  return (
    <div>
      <SectionLabel>Danger Zone</SectionLabel>
      {/* `danger`, not `flagRed`: flagRed is reserved for roster-state
          semantics (see tailwind.config.js) and this is a destructive
          action, the same distinction .btn-danger already makes. The
          fill is the muted danger ground rather than .card's raised
          surface — on the dark theme that surface is a green, which
          read as a green panel behind a red outline. */}
      <div className="card overflow-hidden border-danger/40 bg-danger-bg">
        <SectionRow icon={<TrashIcon className="h-5 w-5" />} title="Delete Account" danger>
          {pendingDeletion ? (
            <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3 text-xs text-flagAmber">
              Your account deletion request is pending admin review.
            </div>
          ) : deleteConfirming ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
              <p className="mb-3 text-sm text-danger">
                This sends an account deletion request to an admin for review. Continue?
              </p>
              <div className="flex gap-2">
                <button onClick={requestDeletion} disabled={deleteSaving} className="btn-danger">
                  {deleteSaving ? 'Submitting…' : 'Yes, request deletion'}
                </button>
                <button onClick={() => setDeleteConfirming(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirming(true)} className="btn-danger">
              Request account deletion
            </button>
          )}
        </SectionRow>
      </div>
    </div>
  )
}
