import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchProfilesById } from '../../lib/changeLog'
import { buildRequestHistory, EMPTY_HISTORY_FILTERS } from '../../lib/requestHistory'
import { REQUEST_TYPE_LABELS, formatRequestValue } from './staffListHelpers'

// Requests › All Requests: the decided requests, their reviewers, and
// that sub-page's search, filters and sort. Moved out of StaffListPage as it was.
export function useRequestHistory({ isAdmin, tab, sub }) {
  // All Requests: everything decided, fetched when that sub-page opens.
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyNames, setHistoryNames] = useState(new Map())
  const [historyFilters, setHistoryFilters] = useState(EMPTY_HISTORY_FILTERS)
  const [historySearch, setHistorySearch] = useState('')
  const [historySort, setHistorySort] = useState('desc')

  // All Requests: sign-ups decided either way, change requests reviewed,
  // locums linked. Reviewer names are looked up once per load.
  async function loadHistory() {
    setHistoryLoading(true)
    const [signupsRes, changesRes, contactsRes] = await Promise.all([
      supabase.from('profiles').select('id, name, surname, role, category, color_code, pattern_type, avatar_url, is_approved, is_rejected, approved_at, approved_by, rejected_at, rejected_by, rejection_note')
        .or('approved_at.not.is.null,is_rejected.eq.true'),
      supabase.from('account_change_requests')
        .select('*, requester:profile_id(name, surname, role, category, avatar_url, color_code, pattern_type)')
        .in('status', ['approved', 'rejected']),
      supabase.from('locum_contacts').select('id, name, surname, linked_profile_id, linked_at').not('linked_profile_id', 'is', null),
    ])
    const items = buildRequestHistory({
      signups: signupsRes.data || [], changeRequests: changesRes.data || [], linkedContacts: contactsRes.data || [],
      typeLabels: REQUEST_TYPE_LABELS, formatValue: formatRequestValue,
    })
    setHistory(items)
    setHistoryNames(await fetchProfilesById(items.map(i => i.reviewedBy)))
    setHistoryLoading(false)
  }
  useEffect(() => {
    if (isAdmin && tab === 'requests' && sub === 'all-requests') loadHistory()
  }, [isAdmin, tab, sub])

  return {
    history, historyLoading, historyNames, historyFilters, setHistoryFilters, historySearch, setHistorySearch,
    historySort, setHistorySort,
  }
}
