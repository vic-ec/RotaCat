import { useEffect, useState } from 'react'
import { CATEGORY_LABELS } from '../../lib/categoryLabels'
import { ROLE_LABELS } from '../../lib/usePendingApprovalReview'
import { allSectionsCollapsed } from '../../lib/collapsibleSections'
import { SORT_MODE_KEY, AZ_DIRECTION_KEY } from './staffListHelpers'
import { buildGroups } from './staffGroups'

// Active Staff / All Staff: search, filters, sort (kept between visits),
// collapsed sections, and the grouped rows they leave. Moved out of StaffListPage as it was.
export function useAccountListFilters({ isAdmin, location, tab, activeAccounts, leaveProfileIds, neverSignedInIds }) {
  // role/category/status/isAdmin are each a Set of selected values — empty
  // means "All" for that dimension (see FilterPanel.jsx). Multi-select: a
  // viewer can filter to e.g. "Registrar OR MO" within one dimension.
  // signin: 'never' — accounts handed over (a temporary password) that
  // nobody has signed in to yet; the dashboard's row links here with
  // ?signin=never.
  const [accountFilters, setAccountFilters] = useState(() => ({
    q: '', role: new Set(), category: new Set(), status: new Set(), isAdmin: new Set(),
    signin: new Set(isAdmin && new URLSearchParams(location.search).get('signin') === 'never' ? ['never'] : []),
  }))

  // Sort / group — persisted locally so it doesn't reset every visit
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem(SORT_MODE_KEY) || 'category' } catch { return 'category' }
  })
  useEffect(() => {
    try { localStorage.setItem(SORT_MODE_KEY, sortMode) } catch { /* ignore */ }
  }, [sortMode])

  // A-Z sort direction — folded into the same flat Sort facet as
  // category/role (see sortFacetOptions below) rather than its own
  // cascading secondary popover.
  const [azDirection, setAzDirection] = useState(() => {
    try { return localStorage.getItem(AZ_DIRECTION_KEY) || 'asc' } catch { return 'asc' }
  })
  useEffect(() => {
    try { localStorage.setItem(AZ_DIRECTION_KEY, azDirection) } catch { /* ignore */ }
  }, [azDirection])

  // ── Selector switch: Quick Sort / Filter ──
  // One shared set of state/popovers for both breakpoints — mobile and
  // desktop each render their own copy of the trigger buttons (shown/hidden
  // via CSS, not conditional rendering, so both exist in the DOM at once,
  // but only one is ever visible/interactive). Quick Sort reads/writes the
  // same sortMode/azDirection state used by buildGroups(); Filter reads/
  // writes the same accountFilters state the grid itself filters on.
  // Search itself is always a plain visible ClearableInput below, same as
  // the Pending Approvals/User Requests tabs' Toolbar search — no
  // click-to-open toggle state needed.

  // Single flat Sort facet — category/role select the mode directly, the
  // two A–Z options fold direction into the same list instead of a nested
  // secondary popover (ToolbarFacet, same shape as every other quick-select
  // pill in the app).
  const sortFacetValue = sortMode === 'az' ? (azDirection === 'desc' ? 'az_desc' : 'az_asc') : sortMode
  const sortFacetOptions = [
    { value: 'category', label: 'Category' },
    { value: 'role', label: 'Role' },
    { value: 'az_asc', label: 'A–Z ascending' },
    { value: 'az_desc', label: 'Z–A descending' },
  ]
  function handleSortFacetChange(value) {
    if (value === 'az_asc') { setSortMode('az'); setAzDirection('asc') }
    else if (value === 'az_desc') { setSortMode('az'); setAzDirection('desc') }
    else setSortMode(value)
  }

  // Per-dimension setter for the Filter panel — each group's onChange gets
  // its own setter bound to that dimension's key, rather than the panel
  // needing to know accountFilters' shape.
  function setAccountFilterDimension(key, nextSet) {
    setAccountFilters(f => ({ ...f, [key]: nextSet }))
  }

  // Collapsed state per group section (keyed by group.key), category/role modes only
  const [collapsedGroups, setCollapsedGroups] = useState({})
  function toggleGroupCollapsed(key) {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }
  // ── Accounts grid: filter options derived from the loaded data ──
  const accountRoleOptions = [...new Set(activeAccounts.map(p => p.role).filter(Boolean))].sort()
  const accountCategoryOptions = [...new Set(activeAccounts.map(p => p.category).filter(Boolean))].sort()

  // Groups for the multi-select Filter panel — Is Admin only makes sense
  // for an admin viewer (matching the desktop table's own Is Admin column,
  // which is isAdmin-gated too).
  const filterGroups = [
    {
      key: 'role', label: 'Role',
      options: accountRoleOptions.map(r => ({ value: r, label: ROLE_LABELS[r] || r })),
      selected: accountFilters.role,
      onChange: next => setAccountFilterDimension('role', next),
    },
    {
      key: 'category', label: 'Category',
      options: accountCategoryOptions.map(c => ({ value: c, label: CATEGORY_LABELS[c] || c })),
      selected: accountFilters.category,
      onChange: next => setAccountFilterDimension('category', next),
    },
    {
      key: 'status', label: 'Status',
      options: [{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On leave' }, { value: 'inactive', label: 'Inactive' }],
      selected: accountFilters.status,
      onChange: next => setAccountFilterDimension('status', next),
    },
    ...(isAdmin ? [{
      key: 'isAdmin', label: 'Is Admin',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
      selected: accountFilters.isAdmin,
      onChange: next => setAccountFilterDimension('isAdmin', next),
    }, {
      key: 'signin', label: 'Sign-in',
      options: [{ value: 'never', label: 'Not signed in yet' }],
      selected: accountFilters.signin,
      onChange: next => setAccountFilterDimension('signin', next),
    }] : []),
  ]

  // Active Staff: anyone currently active (on leave included), plus the
  // accounts that are approved and about to join — a scheduled future start,
  // or a new account that has not replaced its temporary password yet.
  // Deactivated and finished accounts are only on All Staff.
  const tabAccounts = tab === 'active'
    ? activeAccounts.filter(p => p.is_active || p.scheduled_active_date || p.must_change_password)
    : activeAccounts

  const filteredAccounts = tabAccounts.filter(person => {
    const q = accountFilters.q.trim().toLowerCase()
    if (q) {
      const fullName = `${person.surname || ''} ${person.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (accountFilters.role.size > 0 && !accountFilters.role.has(person.role)) return false
    if (accountFilters.category.size > 0 && !accountFilters.category.has(person.category)) return false
    if (accountFilters.status.size > 0) {
      const statusKey = !person.is_active ? 'inactive' : leaveProfileIds.has(person.id) ? 'on_leave' : 'active'
      if (!accountFilters.status.has(statusKey)) return false
    }
    if (accountFilters.isAdmin.size > 0) {
      const isAdminKey = person.is_admin ? 'yes' : 'no'
      if (!accountFilters.isAdmin.has(isAdminKey)) return false
    }
    if (accountFilters.signin.has('never') && !neverSignedInIds.has(person.id)) return false
    return true
  })

  const accountFiltersActive = Boolean(accountFilters.q) || accountFilters.role.size > 0 ||
    accountFilters.category.size > 0 || accountFilters.status.size > 0 || accountFilters.isAdmin.size > 0 ||
    accountFilters.signin.size > 0

  const groups = buildGroups(filteredAccounts, sortMode, azDirection)
  // Only ever true once a viewer has shut every section themselves — an
  // ungrouped list (no labels) never counts as collapsed.
  const allGroupsCollapsed = groups.every(g => g.label) &&
    allSectionsCollapsed(groups, collapsedGroups)

  function clearAllFilters() {
    setAccountFilters({ q: '', role: new Set(), category: new Set(), status: new Set(), isAdmin: new Set(), signin: new Set() })
  }

  return {
    accountFilters, setAccountFilters, sortMode, sortFacetValue, sortFacetOptions, handleSortFacetChange,
    collapsedGroups, setCollapsedGroups, toggleGroupCollapsed, filterGroups, filteredAccounts,
    accountFiltersActive, groups, allGroupsCollapsed, clearAllFilters,
  }
}
