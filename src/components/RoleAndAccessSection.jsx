import SelectMenu from './SelectMenu'
import SectionLabel from './SectionLabel'
import { CONTRACT_TYPE_OPTIONS, OT_SUBTYPE_OPTIONS } from '../lib/staffDefaults'

// Role/category/hours assignment + the admin-permissions decision — the
// section an admin actually has to make a call on, so unlike
// AccountDetailsSection its controls are always live (never a separate
// read-only/editing toggle). `adminAvailable=false` disables the checkbox
// with a stated reason instead of just hiding it — a role/category that
// can't carry admin access should say so, not silently drop the row.
export default function RoleAndAccessSection({
  heading,
  role, onRoleChange, roleOptions,
  showCategory, category, onCategoryChange, categoryOptions,
  showContractType, contractType, onContractTypeChange, hoursHint,
  showSubtype, subtype, onSubtypeChange,
  adminEnabled, onAdminChange, adminAvailable = true, adminUnavailableReason,
  adminHelperText = 'Can manage staff, leave requests, planners and settings.',
}) {
  return (
    <div>
      <SectionLabel>{heading}</SectionLabel>
      <div className="space-y-4 rounded-lg border border-slate-line p-4">
        <div>
          <label className="label-text" htmlFor="role-select">Role *</label>
          <SelectMenu id="role-select" value={role} onChange={onRoleChange} options={roleOptions} />
        </div>

        {showCategory && (
          <div>
            <label className="label-text" htmlFor="category-select">Clinical category *</label>
            <SelectMenu id="category-select" value={category} onChange={onCategoryChange} placeholder="Select…" options={categoryOptions} />
          </div>
        )}

        {showContractType && (
          <div>
            <label className="label-text" htmlFor="hours-select">Hours</label>
            <SelectMenu
              id="hours-select"
              value={contractType}
              onChange={onContractTypeChange}
              placeholder="Select…"
              options={CONTRACT_TYPE_OPTIONS}
              ariaDescribedBy={hoursHint ? 'hours-select-hint' : undefined}
            />
            {hoursHint && <p id="hours-select-hint" className="mt-1 text-xs text-ink-muted">{hoursHint}</p>}
          </div>
        )}

        {showSubtype && (
          <div>
            <label className="label-text" htmlFor="ot-subtype-select">OT subtype</label>
            <SelectMenu id="ot-subtype-select" value={subtype || ''} onChange={onSubtypeChange} placeholder="Not yet assigned…" options={OT_SUBTYPE_OPTIONS} />
          </div>
        )}

        <div className="border-t border-slate-line pt-4">
          <label
            htmlFor="admin-access-checkbox"
            className={`flex items-center gap-2 text-sm ${adminAvailable ? 'text-ink' : 'text-ink-muted'}`}
          >
            <input
              id="admin-access-checkbox"
              type="checkbox"
              checked={adminEnabled}
              onChange={e => onAdminChange(e.target.checked)}
              disabled={!adminAvailable}
              aria-describedby="admin-access-help"
              className="h-4 w-4 rounded border-slate-line accent-accent disabled:cursor-not-allowed disabled:opacity-50"
            />
            Grant admin permissions
          </label>
          <p id="admin-access-help" className="mt-1 pl-6 text-xs text-ink-muted">
            {adminAvailable ? adminHelperText : adminUnavailableReason}
          </p>
        </div>
      </div>
    </div>
  )
}
