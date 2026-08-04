import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import LeaveListView from './LeaveListView'

// This is the most security-sensitive part of the feature. LeaveListView is
// deliberately a "dumb" renderer with zero role-conditional logic — the
// leave_select RLS policy is what actually enforces the visibility matrix
// (requester sees own always; other doctors see others' only once approved;
// clerk sees all approved leave year-round (not date-scoped — the Team
// leave tab itself is hidden for clerks as redundant with that, but the
// query-level contract still holds if this ever renders for one); locum
// sees nothing, enforced by the route being locum-blocked before this ever
// mounts; admin sees all).
// These tests do two things per role: (1) assert the component renders
// exactly the rows the (mocked) RLS-filtered query returned, with nothing
// dropped or added, and (2) assert the query itself carries no extra
// .eq()/.match() filter that would amount to client-side filtering
// standing in for RLS.
const { mockData, methodCalls } = vi.hoisted(() => ({ mockData: { rows: [] }, methodCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      const builder = {
        select(...args) { methodCalls.push(['select', table, ...args]); return builder },
        eq(...args) { methodCalls.push(['eq', table, ...args]); return builder },
        match(...args) { methodCalls.push(['match', table, ...args]); return builder },
        order(...args) { methodCalls.push(['order', table, ...args]); return builder },
        then(resolve, reject) {
          return Promise.resolve({ data: mockData.rows, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

function row(id, overrides) {
  return {
    id,
    profile_id: overrides.own ? 'me' : 'someone-else',
    leave_type: 'annual',
    date_from: '2026-01-01',
    date_to: '2026-01-05',
    status: 'pending',
    profiles: { name: 'Doc', surname: id },
    ...overrides,
  }
}

describe('LeaveListView — role visibility matrix', () => {
  beforeEach(() => {
    methodCalls.length = 0
    mockData.rows = []
  })

  it('never issues a role-conditional filter on the query (no client-side substitute for RLS)', async () => {
    mockData.rows = [row('a', { own: true, status: 'pending' })]
    render(<LeaveListView />)
    await waitFor(() => expect(screen.getByText(/Doc a/)).toBeInTheDocument())
    expect(methodCalls.some(c => c[0] === 'eq' || c[0] === 'match')).toBe(false)
  })

  it('requester (doctor): renders own pending + own approved + others\' approved, historical and future alike', async () => {
    mockData.rows = [
      row('own-pending', { own: true, status: 'pending', date_from: '2099-01-01', date_to: '2099-01-05' }), // own, future, pending
      row('own-approved-past', { own: true, status: 'approved', date_from: '2020-01-01', date_to: '2020-01-05' }), // own, historical, approved
      row('others-approved', { own: false, status: 'approved' }), // others' approved — RLS allows this for a doctor
    ]
    render(<LeaveListView />)
    expect(await screen.findByText(/Doc own-pending/)).toBeInTheDocument()
    expect(await screen.findByText(/Doc own-approved-past/)).toBeInTheDocument()
    expect(await screen.findByText(/Doc others-approved/)).toBeInTheDocument()
    expect(screen.getAllByText(/Doc/)).toHaveLength(3)
  })

  it('admin: renders everything — own and others\', pending and approved, historical and future', async () => {
    mockData.rows = [
      row('own-pending', { own: true, status: 'pending' }),
      row('others-pending', { own: false, status: 'pending' }),
      row('others-approved', { own: false, status: 'approved' }),
      row('historical', { own: false, status: 'approved', date_from: '2019-01-01', date_to: '2019-01-05' }),
      row('future', { own: false, status: 'pending', date_from: '2099-01-01', date_to: '2099-01-05' }),
    ]
    render(<LeaveListView />)
    for (const id of ['own-pending', 'others-pending', 'others-approved', 'historical', 'future']) {
      expect(await screen.findByText(new RegExp(`Doc ${id}`))).toBeInTheDocument()
    }
  })

  it('clerk: RLS returns every approved row year-round, nothing pending — renders exactly that', async () => {
    // Simulates what the leave_select policy's clerk branch actually returns
    // (approved, any date range) — the component itself does no date/status
    // filtering of its own.
    mockData.rows = [
      row('historical-approved', { own: false, status: 'approved', date_from: '2020-01-01', date_to: '2020-01-05' }),
      row('future-approved', { own: false, status: 'approved', date_from: '2099-01-01', date_to: '2099-01-05' }),
    ]
    render(<LeaveListView />)
    expect(await screen.findByText(/Doc historical-approved/)).toBeInTheDocument()
    expect(await screen.findByText(/Doc future-approved/)).toBeInTheDocument()
    expect(screen.getAllByText(/Doc/)).toHaveLength(2)
  })

  it('locum: RLS returns nothing — renders the empty state (this route is also locum-blocked before mount)', async () => {
    mockData.rows = []
    render(<LeaveListView />)
    expect(await screen.findByText(/no leave requests visible to you/i)).toBeInTheDocument()
  })
})
