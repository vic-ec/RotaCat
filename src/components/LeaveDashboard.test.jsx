import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LeaveDashboard from './LeaveDashboard'

let mockAuth = { profile: { id: 'doctor-1' } }
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

const { mockQueues, fromCalls } = vi.hoisted(() => ({ mockQueues: {}, fromCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      fromCalls.push(table)
      const callIndex = fromCalls.filter(t => t === table).length - 1
      const builder = {
        select() { return builder },
        eq() { return builder },
        order() { return builder },
        maybeSingle() { return builder },
        then(resolve, reject) {
          const queue = mockQueues[table] || []
          const result = queue[callIndex] || { data: [], error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

describe('LeaveDashboard ("My leave" tab — doctor only, gated by the caller)', () => {
  beforeEach(() => {
    fromCalls.length = 0
    for (const key of Object.keys(mockQueues)) delete mockQueues[key]
    mockAuth = { profile: { id: 'doctor-1' } }
  })

  it('shows the allowance, upcoming requests, and the request form', async () => {
    mockQueues.annual_leave_balances = [{ data: { days_allotted: 22 }, error: null }]
    mockQueues.leave_requests = [
      { data: [ // own annual rows
        { date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved' },
        { date_from: '2026-09-01', date_to: '2026-09-01', status: 'pending' },
      ], error: null },
      { data: [{ id: 'up1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved' }], error: null }, // own upcoming
    ]

    render(<LeaveDashboard />)

    const allowanceHeading = await screen.findByText('Your allowance')
    expect(allowanceHeading.closest('.card').textContent).toMatch(/17\s*days remaining.*5\s*approved.*1\s*pending/s) // 22 - 5 approved
    expect(await screen.findByText(/Annual leave — 2026-08-10 → 2026-08-14/)).toBeInTheDocument()

    // The form is collapsed behind a button until requested
    expect(screen.queryByRole('button', { name: 'Submit request' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Request leave' }))
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
  })

  it('shows an empty state when there is no allowance row yet', async () => {
    mockQueues.annual_leave_balances = [{ data: null, error: null }]
    render(<LeaveDashboard />)
    expect(await screen.findByText(/No annual leave allowance set/)).toBeInTheDocument()
  })
})
