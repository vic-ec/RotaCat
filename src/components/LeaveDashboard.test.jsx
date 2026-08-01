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

  it('shows the leave tracker, upcoming requests, and the request form', async () => {
    mockQueues.leave_requests = [
      { data: [
        { id: 'up1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved' }, // 5 days
        { id: 'up2', leave_type: 'annual', date_from: '2026-09-01', date_to: '2026-09-01', status: 'pending' }, // 1 pending request
      ], error: null },
    ]

    render(<LeaveDashboard />)

    const trackerHeading = await screen.findByText('Leave tracker')
    expect(trackerHeading.closest('.card').textContent).toMatch(/Annual leave.*5\s*days approved.*1\s*request pending/s)
    expect(await screen.findByText(/Annual leave — 2026-08-10 → 2026-08-14/)).toBeInTheDocument()

    // Special/sick trackers aren't shown until more than one day of that type has been taken
    expect(screen.queryByText('Special leave')).not.toBeInTheDocument()
    expect(screen.queryByText('Sick leave')).not.toBeInTheDocument()

    // The form is collapsed behind a button until requested
    expect(screen.queryByRole('button', { name: 'Submit request' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Request leave' }))
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
  })

  it('shows the special-leave tracker once more than one day has been taken, but not sick leave at exactly one day', async () => {
    mockQueues.leave_requests = [
      { data: [
        { id: 's1', leave_type: 'special_leave', date_from: '2026-02-01', date_to: '2026-02-03', status: 'approved' }, // 3 days
        { id: 'k1', leave_type: 'sick', date_from: '2026-03-01', date_to: '2026-03-01', status: 'approved' }, // 1 day
      ], error: null },
    ]

    render(<LeaveDashboard />)

    expect(await screen.findByText('Special leave')).toBeInTheDocument()
    expect(screen.queryByText('Sick leave')).not.toBeInTheDocument()
  })

  it('shows an empty state with no requests at all', async () => {
    mockQueues.leave_requests = [{ data: [], error: null }]
    render(<LeaveDashboard />)
    expect(await screen.findByText('Leave tracker')).toBeInTheDocument()
    expect(await screen.findByText('Nothing upcoming.')).toBeInTheDocument()
  })
})
