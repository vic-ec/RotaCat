import { UserCog, Stethoscope, ListFilter, Tag } from 'lucide-react'

// The review logs' Admin / Doctor / Change-type / (Role or Category)
// filters as plain descriptors, in the `{key, icon, label, value, onChange,
// options, isActive}` shape Toolbar's facet props already take — and so, in
// turn, MobileFiltersSheet and FloatingActionMenu's `filter.facets`.
//
// Its own module rather than a second export on ChangeLogFilterMenu.jsx:
// that file exports a component, and mixing a non-component export into it
// breaks Fast Refresh (react-refresh/only-export-components). A log that
// shows the facet row on desktop and folds it into the Toolbar FAB below
// `md` builds both from this one definition instead of restating four
// facets twice and letting them drift.
//
// `extraFilter` is the 4th, caller-specific facet: `{ label, options,
// value, onChange, disabled? }` — the roster log uses it for a Role filter,
// the weekend planner log for a Category filter, since only one of those
// applies to either table.
export function changeLogFilterFacets({
  adminOptions, doctorOptions, actionOptions,
  adminId, doctorId, action,
  onAdminChange, onDoctorChange, onActionChange,
  extraFilter,
}) {
  return [
    {
      key: 'admin', icon: <UserCog className="h-4 w-4" />, label: 'Admin',
      value: adminId, onChange: onAdminChange,
      options: [{ value: '', label: 'All admins' }, ...adminOptions],
      isActive: Boolean(adminId),
    },
    {
      key: 'doctor', icon: <Stethoscope className="h-4 w-4" />, label: 'Doctor',
      value: doctorId, onChange: onDoctorChange,
      options: [{ value: '', label: 'All doctors' }, ...doctorOptions],
      isActive: Boolean(doctorId),
    },
    {
      key: 'action', icon: <ListFilter className="h-4 w-4" />, label: 'Change type',
      value: action, onChange: onActionChange,
      options: actionOptions,
      isActive: Boolean(action),
    },
    ...(extraFilter ? [{
      key: 'extra', icon: <Tag className="h-4 w-4" />, label: extraFilter.label,
      value: extraFilter.value, onChange: extraFilter.onChange,
      options: extraFilter.options,
      isActive: Boolean(extraFilter.value),
      disabled: extraFilter.disabled,
    }] : []),
  ]
}
