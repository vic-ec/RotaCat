import SectionLabel from '../../components/SectionLabel'
import SectionRow from './SectionRow'
import { TrashIcon } from './icons'

// Danger Zone: an admin deleting someone else's account. Moved out of AccountSettingsPage as it was.
export default function AdminDeleteAccountSection({
  profile, adminDeleteConfirming, adminDeleteCountdown, adminDeleting, undoAdminDelete, adminDeleteTyped,
  setAdminDeleteTyped, startAdminDeleteCountdown, adminDeleteError, adminDeleteSurnameMatches, resetAdminDelete,
  setAdminDeleteConfirming,
}) {
  return (
    <div>
      <SectionLabel>Danger Zone</SectionLabel>
      <div className="card overflow-hidden border-danger/40 bg-danger-bg">
        <SectionRow icon={<TrashIcon className="h-5 w-5" />} title="Delete account" danger>
          {adminDeleteConfirming ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
              {adminDeleteCountdown !== null || adminDeleting ? (
                /* Step 2: undo window, then the delete itself */
                <div role="status" aria-live="polite">
                  <p className="text-sm font-medium text-danger">
                    {adminDeleting
                      ? `Deleting ${profile?.name} ${profile?.surname}’s account…`
                      : `Deleting ${profile?.name} ${profile?.surname}’s account in ${adminDeleteCountdown} second${adminDeleteCountdown === 1 ? '' : 's'}.`}
                  </p>
                  {!adminDeleting && (
                    <p className="mt-1 text-xs text-ink-light">
                      Nothing has been removed yet. Closing this panel also cancels.
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={undoAdminDelete} disabled={adminDeleting} className="btn-primary">
                      Undo
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 1: type the surname to unlock */
                <>
                  <p className="text-sm text-danger">
                    This permanently removes {profile?.name} {profile?.surname}&rsquo;s sign-in and profile. It cannot be undone once it has run.
                  </p>
                  <p className="mt-1 text-xs text-ink-light">
                    Accounts that already appear on a roster or weekend plan can&rsquo;t be deleted; deactivate those instead.
                    Every deletion is recorded with your name and the date.
                  </p>
                  <label className="label-text mt-3 block" htmlFor="admin-delete-surname">
                    Type <span className="font-semibold text-ink">{profile?.surname}</span> to confirm
                  </label>
                  <input
                    id="admin-delete-surname"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={adminDeleteTyped}
                    onChange={e => setAdminDeleteTyped(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); startAdminDeleteCountdown() } }}
                    placeholder={profile?.surname}
                    className="input-field mt-1"
                  />
                  {adminDeleteError && <p className="mt-2 text-sm text-danger" role="alert">{adminDeleteError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={startAdminDeleteCountdown}
                      disabled={!adminDeleteSurnameMatches}
                      className="btn-danger"
                      title={adminDeleteSurnameMatches ? undefined : 'Type the surname exactly to enable'}
                    >
                      Delete account
                    </button>
                    <button type="button" onClick={resetAdminDelete} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setAdminDeleteConfirming(true)} className="btn-danger">
              Delete account
            </button>
          )}
        </SectionRow>
      </div>
    </div>
  )
}
