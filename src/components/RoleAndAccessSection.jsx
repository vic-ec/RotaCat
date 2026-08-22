import SelectMenu from './SelectMenu'
import SectionLabel from './SectionLabel'
import DetailInfoButton from './DetailInfoButton'
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
  showActiveFrom = false, showActiveUntil = false,
  activeFrom, onActiveFromChange, activeUntil, onActiveUntilChange,
}) {
  return (
    <div>
      <SectionLabel>{heading}</SectionLabel>
      <div className="space-y-4 rounded-lg border border-slate-line p-4">
        <div>
          {/* No asterisk — every field in this card is something the admin
              has to decide one way or another to proceed, not a mix of
              required/optional the way a submission form is, so a "*
              Required" marker wouldn't actually be distinguishing anything. */}
          <label className="label-text" htmlFor="role-select">Role</label>
          <SelectMenu id="role-select" value={role} onChange={onRoleChange} options={roleOptions} />
        </div>

        {showCategory && (
          <div>
            <label className="label-text" htmlFor="category-select">Clinical category</label>
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

        {(showActiveFrom || showActiveUntil) && (
          <div className="border-t border-slate-line pt-4">
            {/* Each date field's own hint lives behind its DetailInfoButton
                rather than a permanently-visible caption — click/tap-
                triggered, not the native `title` attribute, since `title`
                never fires on a touch tap at all. The button is a sibling
                of the <label>, not nested inside it: a <button> is itself
                labelable, so nesting it in a <label for="..."> pointing at
                the date input gave that one label two different associated
                controls at once (the input via `for`, the button via
                wrapping) — ambiguous for assistive tech, and it's also what
                broke the tap in the first place: with a plain non-labelable
                span there instead of a button, tapping it fell through to
                the label's own default action (focusing/opening the date
                input) rather than being consumed by the tap target. */}
            <SectionLabel className="mb-3">Configure access period</SectionLabel>
            <div className={`grid grid-cols-1 gap-3 ${showActiveFrom && showActiveUntil ? 'sm:grid-cols-2' : ''}`}>
              {showActiveFrom && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label className="label-text mb-0" htmlFor="active-from-input">Active from</label>
                    <DetailInfoButton label="About Active from" text="Leave blank to activate immediately on approval." />
                  </div>
                  <input
                    id="active-from-input"
                    type="date"
                    value={activeFrom || ''}
                    onChange={e => onActiveFromChange(e.target.value)}
                    className="input-field"
                  />
                </div>
              )}
              {showActiveUntil && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <label className="label-text mb-0" htmlFor="active-until-input">Active until</label>
                    <DetailInfoButton label="About Active until" text="Schedules a future deactivation. Leave blank for permanent staff." />
                  </div>
                  <input
                    id="active-until-input"
                    type="date"
                    value={activeUntil || ''}
                    onChange={e => onActiveUntilChange(e.target.value)}
                    className="input-field"
                  />
                </div>
              )}
            </div>
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
