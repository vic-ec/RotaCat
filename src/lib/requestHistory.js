// The Staff page's All Requests history: every sign-up approved or
// declined, every account change request reviewed, and every rostered
// locum linked to an account, as one list of items with one shape.
//
//   { id, kind, status, at, person, name, role, category, typeLabel,
//     detail, reviewedBy, note }
//
//   kind      'signup' | 'change' | 'locum-link'
//   status    'approved' | 'declined' | 'linked'
//   at        ISO time the decision was made (null when unknown — a
//             sign-up declined before rejected_at existed)
//   person    the profile-shaped object for the avatar
//   detail    the one-line "what" (an email change: old → new)
//
// Pure functions; the fetch is the page's.

export const HISTORY_STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'linked', label: 'Linked (locum)' },
]

export const HISTORY_TYPE_OPTIONS = [
  { value: 'signup', label: 'Sign-up' },
  { value: 'role', label: 'Role change' },
  { value: 'category', label: 'Category change' },
  { value: 'hours', label: 'Hours change' },
  { value: 'deletion', label: 'Account deletion request' },
  { value: 'locum-link', label: 'Locum linked to account' },
]

const fullName = p => `${p?.name || ''} ${p?.surname || ''}`.trim()

export function buildRequestHistory({ signups = [], changeRequests = [], linkedContacts = [], typeLabels = {}, formatValue = v => v }) {
  const items = []
  for (const p of signups) {
    const declined = Boolean(p.is_rejected)
    if (!declined && !p.approved_at) continue
    items.push({
      id: `signup-${p.id}`, kind: 'signup', type: 'signup',
      status: declined ? 'declined' : 'approved',
      at: declined ? (p.rejected_at || null) : p.approved_at,
      person: p, profileId: p.id, name: fullName(p), role: p.role, category: p.category,
      typeLabel: 'Sign-up', detail: null,
      reviewedBy: declined ? (p.rejected_by || null) : (p.approved_by || null),
      note: declined ? (p.rejection_note || null) : null,
    })
  }
  for (const r of changeRequests) {
    if (r.status !== 'approved' && r.status !== 'rejected') continue
    const person = { id: r.profile_id, ...(r.requester || {}) }
    items.push({
      id: `change-${r.id}`, kind: 'change', type: r.request_type,
      status: r.status === 'approved' ? 'approved' : 'declined',
      at: r.reviewed_at || r.updated_at || null,
      person, profileId: r.profile_id, name: fullName(person), role: person.role, category: person.category,
      typeLabel: typeLabels[r.request_type] || r.request_type,
      detail: r.request_type === 'deletion' ? null : `${formatValue(r.current_value, r.request_type) || '—'} → ${formatValue(r.requested_value, r.request_type)}`,
      reviewedBy: r.reviewed_by || null,
      note: r.admin_notes || r.reason || null,
    })
  }
  for (const c of linkedContacts) {
    if (!c.linked_profile_id) continue
    items.push({
      id: `locum-${c.id}`, kind: 'locum-link', type: 'locum-link', status: 'linked',
      at: c.linked_at || null,
      person: { id: c.linked_profile_id, name: c.name, surname: c.surname, color_code: c.linked_color_code || null },
      profileId: c.linked_profile_id, name: fullName(c), role: 'locum', category: 'Locum',
      typeLabel: 'Locum linked to account', detail: null, reviewedBy: null, note: null,
    })
  }
  return items.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

export const EMPTY_HISTORY_FILTERS = Object.freeze({
  dateFrom: '', dateTo: '', statuses: new Set(), types: new Set(), categories: new Set(), roles: new Set(), reviewers: new Set(),
})

export function historyFiltersActive(filters, q = '') {
  return Boolean(filters.dateFrom || filters.dateTo || q.trim()) ||
    ['statuses', 'types', 'categories', 'roles', 'reviewers'].some(k => filters[k].size > 0)
}

export function filterRequestHistory(items, filters, q = '') {
  const term = q.trim().toLowerCase()
  return items.filter(i => {
    if (term && !i.name.toLowerCase().includes(term)) return false
    if (filters.statuses.size > 0 && !filters.statuses.has(i.status)) return false
    if (filters.types.size > 0 && !filters.types.has(i.type)) return false
    if (filters.categories.size > 0 && !filters.categories.has(i.category)) return false
    if (filters.roles.size > 0 && !filters.roles.has(i.role)) return false
    if (filters.reviewers.size > 0 && !filters.reviewers.has(i.reviewedBy)) return false
    const day = i.at ? i.at.slice(0, 10) : null
    if (filters.dateFrom && (!day || day < filters.dateFrom)) return false
    if (filters.dateTo && (!day || day > filters.dateTo)) return false
    return true
  })
}
