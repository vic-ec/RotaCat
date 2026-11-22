import { describe, it, expect } from 'vitest'
import { buildRequestHistory, filterRequestHistory, EMPTY_HISTORY_FILTERS, historyFiltersActive } from './requestHistory'

const signups = [
  { id: 'p1', name: 'Ada', surname: 'Landers', role: 'doctor', category: 'MO', is_approved: true, approved_at: '2026-11-10T09:00:00Z', approved_by: 'adm' },
  { id: 'p2', name: 'Bo', surname: 'Venter', role: 'locum', category: null, is_rejected: true, rejected_at: '2026-11-12T09:00:00Z', rejected_by: 'adm', rejection_note: 'Not on our books' },
  { id: 'p3', name: 'Cy', surname: 'Old', role: 'doctor', is_rejected: true },
  { id: 'p4', name: 'Di', surname: 'Pending', role: 'doctor', is_approved: false },
]
const changes = [
  { id: 'c1', profile_id: 'p1', request_type: 'hours', current_value: 'a', requested_value: 'b', status: 'approved', reviewed_at: '2026-11-15T10:00:00Z', reviewed_by: 'adm2', requester: { name: 'Ada', surname: 'Landers', role: 'doctor', category: 'MO' } },
  { id: 'c2', profile_id: 'p1', request_type: 'deletion', status: 'rejected', reviewed_at: '2026-11-16T10:00:00Z', reviewed_by: 'adm', admin_notes: 'Keep', requester: { name: 'Ada', surname: 'Landers', role: 'doctor', category: 'MO' } },
  { id: 'c3', profile_id: 'p1', request_type: 'role', status: 'pending', requester: {} },
]
const contacts = [
  { id: 'l1', name: 'Jo', surname: 'Marsh', linked_profile_id: 'loc1', linked_at: '2026-11-14T08:00:00Z' },
  { id: 'l2', name: 'No', surname: 'Link', linked_profile_id: null },
]
const items = buildRequestHistory({ signups, changeRequests: changes, linkedContacts: contacts, typeLabels: { hours: 'Hours change', deletion: 'Account deletion' } })

describe('buildRequestHistory', () => {
  it('keeps only decided items, newest first, with unknown dates last', () => {
    expect(items.map(i => i.id)).toEqual(['change-c2', 'change-c1', 'locum-l1', 'signup-p2', 'signup-p1', 'signup-p3'])
  })
  it('shapes each kind alike', () => {
    expect(items.find(i => i.id === 'signup-p2')).toMatchObject({ status: 'declined', reviewedBy: 'adm', note: 'Not on our books', typeLabel: 'Sign-up', role: 'locum' })
    expect(items.find(i => i.id === 'signup-p3')).toMatchObject({ status: 'declined', at: null, reviewedBy: null })
    expect(items.find(i => i.id === 'change-c1')).toMatchObject({ status: 'approved', typeLabel: 'Hours change', detail: 'a → b', category: 'MO' })
    expect(items.find(i => i.id === 'change-c2')).toMatchObject({ status: 'declined', detail: null, note: 'Keep' })
    expect(items.find(i => i.id === 'locum-l1')).toMatchObject({ status: 'linked', name: 'Jo Marsh', role: 'locum' })
  })
})

describe('filterRequestHistory', () => {
  const f = over => ({ ...EMPTY_HISTORY_FILTERS, ...over })
  it('matches name, status, type, category, role, reviewer and date range', () => {
    expect(filterRequestHistory(items, f(), 'landers').map(i => i.id)).toEqual(['change-c2', 'change-c1', 'signup-p1'])
    expect(filterRequestHistory(items, f({ statuses: new Set(['declined']) })).map(i => i.id)).toEqual(['change-c2', 'signup-p2', 'signup-p3'])
    expect(filterRequestHistory(items, f({ types: new Set(['signup']) })).length).toBe(3)
    expect(filterRequestHistory(items, f({ categories: new Set(['MO']) })).length).toBe(3)
    expect(filterRequestHistory(items, f({ roles: new Set(['locum']) })).map(i => i.id)).toEqual(['locum-l1', 'signup-p2'])
    expect(filterRequestHistory(items, f({ reviewers: new Set(['adm2']) })).map(i => i.id)).toEqual(['change-c1'])
    // An item with no date falls outside any date range.
    expect(filterRequestHistory(items, f({ dateFrom: '2026-11-12', dateTo: '2026-11-14' })).map(i => i.id)).toEqual(['locum-l1', 'signup-p2'])
  })
  it('knows when anything is set', () => {
    expect(historyFiltersActive(f())).toBe(false)
    expect(historyFiltersActive(f(), 'x')).toBe(true)
    expect(historyFiltersActive(f({ roles: new Set(['locum']) }))).toBe(true)
  })
})
