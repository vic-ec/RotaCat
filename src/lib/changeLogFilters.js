// The review logs' Filter panel sections (FilterPanel `groups`, also
// handed to FloatingActionMenu's phone sheet): Doctor first — the one
// most often reached for — then Admin, Change type, and the log's own
// fourth dimension (Role on the roster log, Category on the weekend
// planner log). Every section is tick-several; an empty Set means "all".
//
// Options lists drop their '' "All …" entry: FilterPanel draws its own
// "All" row for each section.
const withoutAll = options => options.filter(o => o.value !== '')

export const EMPTY_LOG_FILTERS = Object.freeze({
  dateFrom: '', dateTo: '', doctorIds: new Set(), adminIds: new Set(), actions: new Set(), extra: new Set(),
})

export function logFiltersActive(filters, q = '') {
  return Boolean(filters.dateFrom || filters.dateTo || q.trim()) ||
    ['doctorIds', 'adminIds', 'actions', 'extra'].some(k => filters[k].size > 0)
}

export function changeLogFilterGroups({ filters, setFilters, doctorOptions, adminOptions, actionOptions, extra }) {
  const set = key => next => setFilters(f => ({ ...f, [key]: next }))
  return [
    { key: 'doctor', label: 'Doctor', options: doctorOptions, selected: filters.doctorIds, onChange: set('doctorIds'), alwaysSearchable: true },
    { key: 'admin', label: 'Admin', options: adminOptions, selected: filters.adminIds, onChange: set('adminIds') },
    { key: 'action', label: 'Change type', options: withoutAll(actionOptions), selected: filters.actions, onChange: set('actions') },
    { key: 'extra', label: extra.label, options: withoutAll(extra.options), selected: filters.extra, onChange: set('extra') },
  ]
}
