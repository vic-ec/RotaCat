import { StatusBadge } from '../../components/ProfileAvatar'
import SelectMenu from '../../components/SelectMenu'
import DetailInfoButton from '../../components/DetailInfoButton'
import DateFieldButton from '../../components/DateFieldButton'
import { categoryNeedsContractChoice, CONTRACT_TYPE_OPTIONS, OT_SUBTYPE_OPTIONS } from '../../lib/staffDefaults'
import { ROLE_LABELS, ROLE_OPTIONS } from '../../lib/usePendingApprovalReview'
import { CATEGORY_LABELS, categoryOptionsForRole, formatRequestedValue } from './accountSettingsHelpers'
import SectionRow from './SectionRow'
import Toggle from './Toggle'
import { ShieldIcon } from './icons'

// Role & Access (see the comment where AccountSettingsPage renders it): an
// admin's direct edit with the Active switch, annual leave days and the
// super-admin transfer; everyone else's read-only view with the change
// request form. Moved out of AccountSettingsPage as it was.
export default function RoleAccessSection({
  isAdmin, adminIsActive, isOnLeave, setStatusConfirmNextActive, statusMsg, adminRole, handleAdminRoleChange,
  adminCategory, handleAdminCategoryChange, adminContractType, setAdminContractType, setAdminSubtype, adminSubtype,
  profile, adminIsAdmin, setAdminIsAdmin, adminEcStart, setAdminEcStart, saveAdminAccountFields, adminSaving,
  adminFieldsDirty, adminJustSaved, adminMsg, currentYear, annualLeaveDays, setAnnualLeaveDays,
  saveAnnualLeaveDays, annualLeaveDaysSaving, annualLeaveDaysLoaded, annualLeaveDaysJustSaved, annualLeaveDaysMsg,
  isOwnAccount, isSuperAdmin, otherAdmins, transferConfirming, transferSuperAdmin, transferSaving,
  setTransferConfirming, transferTargetId, setTransferTargetId, transferMsg, pendingRoleOrCategory,
  submitChangeRequest, requestForm, setRequestForm, requestSaving, requestMsg,
}) {
  return (
    <SectionRow
      icon={<ShieldIcon className="h-5 w-5" />}
      title="Role & Access"
    >
      {isAdmin && (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-line pb-4">
      <div>
        <p className="text-sm font-medium text-ink">Account active</p>
        <p className="text-xs text-ink-muted">Inactive accounts remain on record but are excluded from roster generation.</p>
        {adminIsActive && isOnLeave && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
            <StatusBadge active onLeave size={14} /> Currently on approved leave.
          </p>
        )}
      </div>
      <Toggle checked={adminIsActive} onChange={setStatusConfirmNextActive} />
    </div>
  )}
  {isAdmin && statusMsg && (
    <span className={`mb-4 block text-xs font-medium ${statusMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
      {statusMsg.text}
    </span>
  )}
  {isAdmin ? (
    <div className="space-y-4">
      <div>
        <label className="label-text">Role</label>
        <SelectMenu
          value={adminRole}
          onChange={handleAdminRoleChange}
          options={ROLE_OPTIONS}
        />
      </div>
      {adminRole !== 'clerk' && (
        <div>
          <label className="label-text">Category</label>
          <SelectMenu
            value={adminCategory}
            onChange={handleAdminCategoryChange}
            placeholder={adminRole === 'locum' ? 'None' : 'Select…'}
            options={categoryOptionsForRole(adminRole)}
          />
        </div>
      )}

      {adminRole !== 'clerk' && categoryNeedsContractChoice(adminCategory) && (
        <div>
          <label className="label-text">Hours</label>
          <SelectMenu
            value={adminContractType}
            onChange={v => { setAdminContractType(v); if (v !== 'Junior_Doctor_Overtime') setAdminSubtype(null) }}
            placeholder="Select…"
            options={CONTRACT_TYPE_OPTIONS}
          />
          <p className="mt-1 text-xs text-ink-muted">
            Changing this opens a new current rotation block for {profile.name || 'this doctor'} in the Rotations planner — it doesn&apos;t overwrite any future blocks already planned there.
          </p>
        </div>
      )}
      {adminRole !== 'clerk' && categoryNeedsContractChoice(adminCategory) && adminContractType === 'Junior_Doctor_Overtime' && (
        <div>
          <label className="label-text">OT subtype</label>
          <SelectMenu
            value={adminSubtype || ''}
            onChange={setAdminSubtype}
            placeholder="Not yet assigned…"
            options={OT_SUBTYPE_OPTIONS}
          />
        </div>
      )}

      {adminRole !== 'clerk' && (
        <div>
          {/* Current persisted state, distinct from the checkbox below
              (which reflects the draft `adminIsAdmin` value) — so an
              admin can see what's true right now separately from what
              they're about to change it to, rather than reading that
              off the checkbox alone. */}
          <p className="mb-1.5 text-xs font-medium text-ink-muted">
            {profile.is_admin ? 'Administrator access enabled' : 'Standard staff access'}
          </p>
          <label className="flex items-center gap-2 text-sm text-ink" htmlFor="admin-permissions-checkbox">
            <input
              id="admin-permissions-checkbox"
              type="checkbox"
              checked={adminIsAdmin}
              onChange={e => setAdminIsAdmin(e.target.checked)}
              aria-describedby="admin-permissions-help"
              className="h-4 w-4 rounded border-slate-line accent-accent"
            />
            Grant admin permissions
            {profile.is_super_admin && <span className="text-xs text-ink-muted">(super-admin — can&apos;t be removed here)</span>}
          </label>
          <p id="admin-permissions-help" className="mt-1 pl-6 text-xs text-ink-muted">
            Can manage staff, leave requests, planners and settings.
          </p>
        </div>
      )}

      {adminRole === 'doctor' && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <label className="label-text mb-0" htmlFor="ec-start-input">In EC from</label>
            <DetailInfoButton
              label="About In EC from"
              text="The first day this doctor worked in the Emergency Centre. Hours checks don't count the days before it, so a month they hadn't started yet isn't flagged as under their hours. Interns and registrars use their rotation dates; leave this blank for them."
            />
          </div>
          <DateFieldButton id="ec-start-input" label="In EC from" labelledExternally value={adminEcStart} onChange={v => setAdminEcStart(v || '')} fullWidth />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={saveAdminAccountFields} disabled={adminSaving || !adminFieldsDirty} className="btn-primary">
          {adminSaving ? 'Saving…' : adminJustSaved ? 'Saved.' : 'Update'}
        </button>
        {adminMsg && (
          <span className="text-xs font-medium text-flagRed">{adminMsg.text}</span>
        )}
      </div>

      {adminRole === 'doctor' && (
        <div className="border-t border-slate-line pt-4">
          <label className="label-text">Annual leave days ({currentYear})</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="1"
              value={annualLeaveDays}
              onChange={e => setAnnualLeaveDays(e.target.value)}
              placeholder="Not set"
              className="input-field w-24"
            />
            <button
              onClick={saveAnnualLeaveDays}
              disabled={annualLeaveDaysSaving || annualLeaveDays === annualLeaveDaysLoaded}
              className="btn-secondary"
            >
              {annualLeaveDaysSaving ? 'Saving…' : annualLeaveDaysJustSaved ? 'Saved.' : 'Save'}
            </button>
          </div>
          {annualLeaveDaysMsg && (
            <span className="mt-1 block text-xs font-medium text-flagRed">{annualLeaveDaysMsg.text}</span>
          )}
        </div>
      )}

      {isOwnAccount && isSuperAdmin && (
        <div className="mt-2 border-t border-slate-line pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Super-admin</p>
          {otherAdmins.length === 0 ? (
            <p className="text-xs text-ink-muted">
              No other admins yet — make someone else an admin first to be able to transfer this.
            </p>
          ) : transferConfirming ? (
            <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3">
              <p className="mb-2 text-xs text-flagAmber">
                This immediately hands off super-admin — you won&apos;t be able to take it back yourself.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={transferSuperAdmin}
                  disabled={transferSaving}
                  className="btn-warning px-3"
                >
                  {transferSaving ? 'Transferring…' : 'Confirm transfer'}
                </button>
                <button onClick={() => setTransferConfirming(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SelectMenu
                value={transferTargetId}
                onChange={setTransferTargetId}
                placeholder="Transfer to…"
                options={otherAdmins.map(a => ({ value: a.id, label: `${a.name} ${a.surname}` }))}
                className="flex-1"
              />
              <button
                onClick={() => setTransferConfirming(true)}
                disabled={!transferTargetId}
                className="btn-secondary whitespace-nowrap"
              >
                Transfer
              </button>
            </div>
          )}
          {transferMsg && (
            <span className={`mt-2 block text-xs font-medium ${transferMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
              {transferMsg.text}
            </span>
          )}
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-4">
      <div>
        <label className="label-text">Role</label>
        <select value={profile.role || ''} disabled className="input-field cursor-not-allowed opacity-60">
          <option value={profile.role || ''}>{ROLE_LABELS[profile.role] || profile.role}</option>
        </select>
      </div>
      <div>
        <label className="label-text">Category</label>
        <select value={profile.category || ''} disabled className="input-field cursor-not-allowed opacity-60">
          <option value={profile.category || ''}>{profile.category ? (CATEGORY_LABELS[profile.category] || profile.category) : 'None'}</option>
        </select>
      </div>
      {/* Explicit status text rather than a disabled checkbox alone —
          a checkbox's checked/unchecked state isn't a reliable way to
          convey "you do/don't have admin access" in a purely
          read-only display. */}
      <p className="text-sm text-ink-muted">
        {profile.is_admin ? 'Administrator access enabled' : 'Standard staff access'}
      </p>

      <div className="rounded-lg border border-flagBlue/30 bg-flagBlue-bg p-3 text-xs text-flagBlue">
        Role and category changes need admin approval before they take effect.
      </div>

      {pendingRoleOrCategory ? (
        <div className="rounded-lg border border-flagAmber/30 bg-flagAmber-bg p-3 text-xs text-flagAmber">
          A {pendingRoleOrCategory.request_type} change to &quot;{formatRequestedValue(pendingRoleOrCategory)}&quot; is pending admin review.
        </div>
      ) : (
        <form onSubmit={submitChangeRequest} className="space-y-3 rounded-lg border border-slate-line bg-canvas-sunken p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Change</label>
              <SelectMenu
                value={requestForm.type}
                onChange={v => setRequestForm(f => ({ ...f, type: v, value: '', subtype: null }))}
                options={[
                  { value: 'role', label: 'Role' },
                  ...(profile.role === 'doctor' || profile.role === 'locum' ? [{ value: 'category', label: 'Category' }] : []),
                  ...(categoryNeedsContractChoice(profile.category) ? [{ value: 'hours', label: 'Hours (EC/OT)' }] : []),
                ]}
              />
            </div>
            <div>
              <label className="label-text">New value</label>
              <SelectMenu
                value={requestForm.value}
                onChange={v => setRequestForm(f => ({ ...f, value: v, subtype: v === 'Junior_Doctor_Overtime' ? f.subtype : null }))}
                options={
                  requestForm.type === 'role' ? ROLE_OPTIONS
                    : requestForm.type === 'category' ? categoryOptionsForRole(profile.role)
                    : CONTRACT_TYPE_OPTIONS
                }
              />
            </div>
          </div>
          {requestForm.type === 'role' && profile.role !== 'doctor' && requestForm.value === 'doctor' && (
            <p className="text-xs text-ink-muted">
              Once this is approved, you&apos;ll be able to submit a separate request to set your clinical category.
            </p>
          )}
          {requestForm.type === 'hours' && requestForm.value === 'Junior_Doctor_Overtime' && (
            <div>
              <label className="label-text">OT subtype</label>
              <SelectMenu
                value={requestForm.subtype || ''}
                onChange={v => setRequestForm(f => ({ ...f, subtype: v }))}
                placeholder="Select…"
                options={OT_SUBTYPE_OPTIONS}
              />
            </div>
          )}
          <div>
            <label className="label-text">Reason (optional)</label>
            <textarea
              value={requestForm.reason}
              onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))}
              rows={2}
              className="input-field"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={requestSaving} className="btn-secondary">
              {requestSaving ? 'Submitting…' : 'Submit request'}
            </button>
            {requestMsg && (
              <span className={`text-xs font-medium ${requestMsg.type === 'error' ? 'text-flagRed' : 'text-success'}`}>
                {requestMsg.text}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )}
    </SectionRow>
  )
}
