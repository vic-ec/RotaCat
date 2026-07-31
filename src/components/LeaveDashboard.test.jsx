import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LeaveDashboard from './LeaveDashboard'

let mockAuth = {}
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

// leaveDashboard.jsx issues several different queries against the same
// `leave_requests` table within one load() — a single table-keyed response
// map can't disambiguate them, so responses are queued per table and
// consumed in call order instead (matching the component's Promise.all
// sequence: away-today, pending-count, then — for a doctor — annual rows,
// then own upcoming rows).
const { mockQueues, fromCalls } = vi.hoisted(() => ({ mockQueues: {}, fromCalls: [] }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table) {
      fromCalls.push(table)
      const callIndex = fromCalls.filter(t => t === table).length - 1
      const builder = {
        select() { return builder },
        eq() { return builder },
        gte() { return builder },
        lte() { return builder },
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

function renderDashboard(onNavigate = vi.fn()) {
  return render(<LeaveDashboard onNavigate={onNavigate} />, { wrapper: MemoryRouter })
}

describe('LeaveDashboard', () => {
  beforeEach(() => {
    fromCalls.length = 0
    for (const key of Object.keys(mockQueues)) delete mockQueues[key]
  })

  it('doctor: shows allowance, upcoming, and leave-today stats; no approval queue link', async () => {
    mockAuth = { profile: { id: 'doctor-1' }, canSubmitLeave: true, isAdmin: false }
    mockQueues.leave_requests = [
      { data: [{ id: 'a1' }, { id: 'a2' }], error: null }, // away today
      { data: [{ id: 'p1' }], error: null }, // pending (own only, per RLS)
      { data: [ // own annual rows
        { date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved' },
        { date_from: '2026-09-01', date_to: '2026-09-01', status: 'pending' },
      ], error: null },
      { data: [{ id: 'up1', leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', status: 'approved' }], error: null }, // own upcoming
    ]
    mockQueues.annual_leave_balances = [{ data: { days_allotted: 22 }, error: null }]

    const onNavigate = vi.fn()
    renderDashboard(onNavigate)

    const allowanceHeading = await screen.findByText('Your allowance')
    expect(allowanceHeading.closest('.card').textContent).toMatch(/17\s*days remaining.*5\s*approved.*1\s*pending/s) // 22 - 5 approved
    expect(await screen.findByText(/Annual leave — 2026-08-10 → 2026-08-14/)).toBeInTheDocument()
    expect(screen.getByText('Leave today').closest('.card').textContent).toMatch(/2\s*doctors away/)
    expect(screen.queryByRole('button', { name: /Approval queue/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Request leave' }))
    expect(onNavigate).toHaveBeenCalledWith('submit')
  })

  it('admin: no personal allowance/upcoming, shows approval queue link with pending count', async () => {
    mockAuth = { profile: { id: 'admin-1' }, canSubmitLeave: false, isAdmin: true }
    mockQueues.leave_requests = [
      { data: [{ id: 'a1' }], error: null },
      { data: [{ id: 'p1' }, { id: 'p2' }], error: null },
    ]

    const onNavigate = vi.fn()
    renderDashboard(onNavigate)

    const leaveToday = await screen.findByText('Leave today')
    expect(leaveToday.closest('.card').textContent).toMatch(/1\s*doctor away.*2\s*requests pending/s)
    expect(leaveToday.closest('.card').textContent).not.toMatch(/of yours/)
    expect(screen.queryByText('Your allowance')).not.toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Approval queue (2)' }))
    expect(onNavigate).toHaveBeenCalledWith('queue')
  })

  it('clerk: no personal sections, no planner quick links, "of yours" qualifier on pending', async () => {
    mockAuth = { profile: { id: 'clerk-1' }, canSubmitLeave: false, isAdmin: false }
    mockQueues.leave_requests = [
      { data: [], error: null },
      { data: [], error: null },
    ]

    renderDashboard()

    const leaveToday = await screen.findByText('Leave today')
    expect(leaveToday.closest('.card').textContent).toMatch(/of yours/)
    expect(screen.queryByRole('button', { name: 'Request leave' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annual planner' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Weekends' })).toBeInTheDocument()
  })
})
