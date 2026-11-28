import ClearableInput from '../../components/ClearableInput'
import CapsLockNotice from '../../components/CapsLockNotice'
import { PASSWORD_HINT } from '../../lib/passwordPolicy'
import SectionRow from './SectionRow'
import { LockIcon } from './icons'

// Change password (your own account). Moved out of AccountSettingsPage as it was.
export default function ChangePasswordSection({ pwForm, setPwForm, pwCapsLock, changePassword, resetPasswordForm, pwSaving, pwDirty, pwJustSaved, pwMsg }) {
  return (
    <SectionRow icon={<LockIcon className="h-5 w-5" />} title="Change password" onClose={resetPasswordForm}>
      <div className="mb-4 rounded-lg border border-flagBlue/30 bg-flagBlue-bg px-3 py-1.5 text-xs text-flagBlue">
        {PASSWORD_HINT}
      </div>
      <form onSubmit={changePassword} className="space-y-4">
        <div>
          <label className="label-text">Current password</label>
          <ClearableInput
            type="password"
            value={pwForm.current}
            onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
            onKeyDown={pwCapsLock.onKeyDown}
            onKeyUp={pwCapsLock.onKeyUp}
            className="input-field"
            autoComplete="current-password"
            placeholder="Enter current password"
            clearLabel="Clear current password"
          />
        </div>
        <div>
          <label className="label-text">New password</label>
          <ClearableInput
            type="password"
            value={pwForm.password}
            onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={pwCapsLock.onKeyDown}
            onKeyUp={pwCapsLock.onKeyUp}
            className="input-field"
            autoComplete="new-password"
            placeholder="Enter new password"
            clearLabel="Clear new password"
          />
        </div>
        <div>
          <label className="label-text">Confirm password</label>
          <ClearableInput
            type="password"
            value={pwForm.confirm}
            onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
            onKeyDown={pwCapsLock.onKeyDown}
            onKeyUp={pwCapsLock.onKeyUp}
            className="input-field"
            autoComplete="new-password"
            placeholder="Re-enter password"
            clearLabel="Clear confirm password"
          />
          <CapsLockNotice show={pwCapsLock.capsOn} />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pwSaving || !pwDirty} className="btn-primary">
            {pwSaving ? 'Updating…' : pwJustSaved ? 'Saved.' : 'Update'}
          </button>
          <button type="button" onClick={resetPasswordForm} disabled={pwSaving || !pwDirty} className="btn-secondary">
            Cancel
          </button>
          {pwMsg && (
            <span className="text-xs font-medium text-flagRed">{pwMsg.text}</span>
          )}
        </div>
      </form>
    </SectionRow>
  )
}
