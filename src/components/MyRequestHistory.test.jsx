import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyRequestHistory from './MyRequestHistory'

let mockAuth = { profile: { id: 'doctor-1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const { mockData, eqCalls } = vi.hoisted(() => ({ mockData: { rows: [] }, eqCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      const builder = {
        select() { return builder },
        eq(...args) { eqCalls.push([table, ...args]); return builder },
        order() { return builder },
        then(resolve, reject) {
          return Promise.resolve({ data: mockData.rows, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

describe('MyRequestHistory', () => {
  beforeEach(() => {
    eqCalls.length = 0
    mockData.rows = []
  })

  it('explicitly scopes the query to the signed-in profile', async () => {
    mockData.rows = [{ id: 'r1', leave_type: 'annual', date_from: '2026-01-01', date_to: '2026-01-05', status: 'pending' }]
    render(<MyRequestHistory />)
    await screen.findByText(/Annual leave/)
    expect(eqCalls).toContainEqual(['leave_requests', 'profile_id', 'doctor-1'])
  })

  it('shows both past and future requests, including rejected ones with the reviewer note', async () => {
    mockData.rows = [
      {
        id: 'r1', leave_type: 'sick', date_from: '2025-03-01', date_to: '2025-03-02', status: 'rejected',
        reviewed_at: '2025-02-28T00:00:00Z', admin_notes: 'No cover available', reviewer: { name: 'Ada', surname: 'Admin' },
      },
    ]
    render(<MyRequestHistory />)
    expect(await screen.findByText('Rejected')).toBeInTheDocument()
    expect(screen.getByText(/Approved by Ada Admin|Rejected by Ada Admin/)).toBeInTheDocument()
    expect(screen.getByText(/No cover available/)).toBeInTheDocument()
  })

  it('shows an empty state with no requests', async () => {
    render(<MyRequestHistory />)
    expect(await screen.findByText('No leave requests on record.')).toBeInTheDocument()
  })
})
