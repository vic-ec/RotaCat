import { UserCog, Stethoscope, ListFilter, Tag } from 'lucide-react'
import { ToolbarFacet } from './Toolbar'

// Admin/Doctor/Change-type/(Role or Category) filters for the Roster and
// Weekend Planner review logs — four independent single-select facets built
// on the app's one shared quick-select-pill primitive (ToolbarFacet, aka
// QuickSelectButton), same shape as RosterDashboardPage's Month/Year facets.
// Previously a single icon-only trigger collapsing all four into stacked
// SelectMenu dropdowns behind one popover; that read as its own bespoke
// interaction model next to every other filter surface in the app, which
// all use this same facet row instead. `extraFilter` is the 4th, caller-
// specific facet: { label, options, value, onChange, disabled? } — the
// roster log uses it for a Role filter, the weekend planner log for a
// Category filter, since only one of those applies to either table.
export default function ChangeLogFilterMenu({
  adminOptions, doctorOptions, actionOptions,
  adminId, doctorId, action,
  onAdminChange, onDoctorChange, onActionChange,
  extraFilter,
}) {
  return (
    <>
      <ToolbarFacet
        icon={<UserCog className="h-4 w-4" />}
        label="Admin"
        value={adminId}
        onChange={onAdminChange}
        options={[{ value: '', label: 'All admins' }, ...adminOptions]}
        isActive={Boolean(adminId)}
      />
      <ToolbarFacet
        icon={<Stethoscope className="h-4 w-4" />}
        label="Doctor"
        value={doctorId}
        onChange={onDoctorChange}
        options={[{ value: '', label: 'All doctors' }, ...doctorOptions]}
        isActive={Boolean(doctorId)}
      />
      <ToolbarFacet
        icon={<ListFilter className="h-4 w-4" />}
        label="Change type"
        value={action}
        onChange={onActionChange}
        options={actionOptions}
        isActive={Boolean(action)}
      />
      {extraFilter && (
        <ToolbarFacet
          icon={<Tag className="h-4 w-4" />}
          label={extraFilter.label}
          value={extraFilter.value}
          onChange={extraFilter.onChange}
          options={extraFilter.options}
          isActive={Boolean(extraFilter.value)}
          disabled={extraFilter.disabled}
        />
      )}
    </>
  )
}
