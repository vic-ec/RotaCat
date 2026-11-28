import { useState } from 'react'

// Requests › New Users and User Requests: each list's search, role filter
// and sort, and the rows they leave. Moved out of StaffListPage as it was.
export function useRequestQueues({ pending, accountRequests }) {
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [pendingSortDirection, setPendingSortDirection] = useState('asc')
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [requestsSortDirection, setRequestsSortDirection] = useState('asc')

  // Approvals/User Requests toolbars — each view gets its own search text
  // and role filter, independent of the accounts tab's own accountFilters.
  // Popover open/anchor state now lives inside the shared Toolbar component.
  const [pendingSearchQuery, setPendingSearchQuery] = useState('')
  const [pendingRoleFilter, setPendingRoleFilter] = useState('all')

  const [requestsSearchQuery, setRequestsSearchQuery] = useState('')
  const [requestsRoleFilter, setRequestsRoleFilter] = useState('all')

  // ── Approvals/User Requests: search + role filter, same substring-match
  // and role-equality rules as the accounts tab's own filter. ──
  const pendingRoleOptions = [...new Set(pending.map(p => p.role).filter(Boolean))].sort()
  const filteredPending = pending.filter(person => {
    const q = pendingSearchQuery.trim().toLowerCase()
    if (q) {
      const fullName = `${person.surname || ''} ${person.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (pendingRoleFilter !== 'all' && person.role !== pendingRoleFilter) return false
    return true
  })
  const orderedPending = pendingSortDirection === 'asc' ? filteredPending : [...filteredPending].reverse()

  const requestsRoleOptions = [...new Set(accountRequests.map(r => r.requester?.role).filter(Boolean))].sort()
  const filteredRequests = accountRequests.filter(r => {
    const q = requestsSearchQuery.trim().toLowerCase()
    if (q) {
      const fullName = `${r.requester?.surname || ''} ${r.requester?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    if (requestsRoleFilter !== 'all' && r.requester?.role !== requestsRoleFilter) return false
    return true
  })
  const displayedRequests = requestsSortDirection === 'asc' ? filteredRequests : [...filteredRequests].reverse()

  return {
    pendingSortDirection, setPendingSortDirection, requestsSortDirection, setRequestsSortDirection,
    pendingSearchQuery, setPendingSearchQuery, pendingRoleFilter, setPendingRoleFilter, requestsSearchQuery,
    setRequestsSearchQuery, requestsRoleFilter, setRequestsRoleFilter, pendingRoleOptions, filteredPending,
    orderedPending, requestsRoleOptions, filteredRequests, displayedRequests,
  }
}
